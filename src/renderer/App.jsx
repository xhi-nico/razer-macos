import React, { useState, useEffect } from 'react';
import './react-tabs.css';
import { ipcRenderer } from 'electron';
import { ViewDeviceSettings } from './views/viewdevicesettings';
import { ViewColorSettings } from './views/viewcolorpicker';
import { ViewStateSettings } from './views/viewstatesettings';

/**
 * Without this, one render error unmounts the whole tree and the window stays
 * blank until the app restarts. It sits inside the keyed view, so the next
 * render-view starts it fresh.
 */
class ViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <div className='view-error'>
        <p>This window hit an error. Open it again from the menu bar.</p>
        <pre>{String(this.state.error.message ?? this.state.error)}</pre>
      </div>;
    }
    return this.props.children;
  }
}

/**
 * Root React component
 */
export class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      mode: 'device',
      message: null,
      // Bumped on every render-view so the view below is remounted. The child
      // views read props.config in their constructor, so they only pick up a
      // new device on mount. This used to happen by accident: React 16 did not
      // batch setState outside its own event handlers, so clearing the mode and
      // then setting it produced two renders, and the second remounted the view.
      // React 18 batches those into one render, the view is never unmounted, and
      // the constructor never re-runs. A changing key makes the remount explicit
      // rather than dependent on batching behaviour.
      renderKey: 0
    };

    ipcRenderer.on('render-view', (event, message) => {
      const {mode} = message;
      this.setState(previous => ({
        mode: mode,
        message: message,
        renderKey: previous.renderKey + 1
      }));
    })
  }

  render() {
    return <ViewErrorBoundary key={this.state.renderKey}>{this.renderView()}</ViewErrorBoundary>;
  }

  renderView() {
    if(this.state.mode === 'device') {
      return <ViewDeviceSettings config={this.state.message}></ViewDeviceSettings>;
    } else if(this.state.mode == 'color') {
      return <ViewColorSettings config={this.state.message}></ViewColorSettings>;
    } else if(this.state.mode == 'state') {
      return <ViewStateSettings config={this.state.message}></ViewStateSettings>;
    }
    return <div></div>;
  }


}
