#include <napi.h>
#import <EventKit/EventKit.h>

#include "calendar.h"

// Kept for the app's lifetime: a store is slow to create and keeps itself in
// sync with the Calendar database while it lives.
static EKEventStore *store = nil;

static EKEventStore *sharedStore() {
    if (store == nil) {
        store = [[EKEventStore alloc] init];
    }
    return store;
}

// Asking for access without this key in Info.plist kills the app, and the
// development Electron binary does not have it.
static bool canAskForAccess() {
    return [[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSCalendarsFullAccessUsageDescription"] != nil;
}

/**
 * "granted", "denied", "notDetermined", or "unavailable" when this build
 * cannot ask (see canAskForAccess).
 */
Napi::String CalendarAccess(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (!canAskForAccess()) {
        return Napi::String::New(env, "unavailable");
    }
    switch ([EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent]) {
        case EKAuthorizationStatusNotDetermined:
            return Napi::String::New(env, "notDetermined");
        case EKAuthorizationStatusDenied:
        case EKAuthorizationStatusRestricted:
        case EKAuthorizationStatusWriteOnly:
            return Napi::String::New(env, "denied");
        default:
            return Napi::String::New(env, "granted");
    }
}

/**
 * Shows the system's one-time calendar permission prompt. Resolves to whether
 * access was granted.
 */
Napi::Value RequestCalendarAccess(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);
    if (!canAskForAccess()) {
        deferred->Resolve(Napi::Boolean::New(env, false));
        return deferred->Promise();
    }

    // The completion handler runs on a background queue; hop back to JS through this.
    auto resolve = std::make_shared<Napi::ThreadSafeFunction>(Napi::ThreadSafeFunction::New(
        env, Napi::Function::New(env, [](const Napi::CallbackInfo &) {}), "calendarAccess", 0, 1));
    void (^completion)(BOOL, NSError *) = ^(BOOL granted, NSError *error) {
        resolve->BlockingCall([deferred, granted](Napi::Env env, Napi::Function) {
            deferred->Resolve(Napi::Boolean::New(env, granted));
        });
        resolve->Release();
    };

    if (@available(macOS 14.0, *)) {
        [sharedStore() requestFullAccessToEventsWithCompletion:completion];
    } else {
        [sharedStore() requestAccessToEntityType:EKEntityTypeEvent completion:completion];
    }
    return deferred->Promise();
}

static bool hasReadAccess() {
    EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
    if (@available(macOS 14.0, *)) {
        return status == EKAuthorizationStatusFullAccess;
    }
    return status == EKAuthorizationStatusAuthorized;
}

static bool isMeetingIAttend(EKEvent *event) {
    if (event.allDay || event.status == EKEventStatusCanceled || !event.hasAttendees) {
        return false;
    }
    for (EKParticipant *attendee in event.attendees) {
        if (attendee.isCurrentUser) {
            return attendee.participantStatus != EKParticipantStatusDeclined;
        }
    }
    return true; // organiser, or not listed
}

/**
 * Start times (ms since epoch) of meetings starting between `fromMs` and `toMs`.
 * A meeting is a timed, non-cancelled event with other attendees that you have
 * not declined, so solo focus blocks and holds never count.
 */
Napi::Value MeetingStartsBetween(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Array starts = Napi::Array::New(env);
    if (!hasReadAccess()) {
        return starts;
    }

    NSDate *from = [NSDate dateWithTimeIntervalSince1970:info[0].ToNumber().DoubleValue() / 1000.0];
    NSDate *to = [NSDate dateWithTimeIntervalSince1970:info[1].ToNumber().DoubleValue() / 1000.0];
    // The predicate matches events that overlap the range; keep those that start inside it.
    NSPredicate *predicate = [sharedStore() predicateForEventsWithStartDate:from endDate:to calendars:nil];

    uint32_t count = 0;
    for (EKEvent *event in [sharedStore() eventsMatchingPredicate:predicate]) {
        if (isMeetingIAttend(event) && [event.startDate compare:from] != NSOrderedAscending) {
            starts[count++] = Napi::Number::New(env, event.startDate.timeIntervalSince1970 * 1000.0);
        }
    }
    return starts;
}

void InitCalendar(Napi::Env env, Napi::Object exports) {
    exports.Set("calendarAccess", Napi::Function::New(env, CalendarAccess));
    exports.Set("requestCalendarAccess", Napi::Function::New(env, RequestCalendarAccess));
    exports.Set("meetingStartsBetween", Napi::Function::New(env, MeetingStartsBetween));
}
