// Stands in for Tauri when the Moss front end runs in a plain browser for the
// README GIFs and the trailer. Loaded before the app's own code (Playwright
// `addInitScript`).
//
// - App commands go to the bridge (media/bridge), which runs the real core on
//   a copy of sample-data/.
// - Tauri's own plugin calls (window theme, app version, events) get harmless
//   answers, since there is no desktop window here.
;(() => {
  const BRIDGE = window.__MOSS_BRIDGE__ ?? 'http://127.0.0.1:4823'

  // How many bridge calls are still running. The capture script waits for
  // zero before taking each frame, so a frame never shows a half-done action.
  window.__mossPending = 0

  let nextId = 1
  const callbacks = new Map()

  // Tauri passes JS callbacks to Rust as numbers; this is how it registers them.
  function transformCallback(callback, once = false) {
    const id = nextId++
    callbacks.set(id, (payload) => {
      if (once) callbacks.delete(id)
      return callback?.(payload)
    })
    window[`_${id}`] = (payload) => callbacks.get(id)?.(payload)
    return id
  }

  async function invoke(cmd, args = {}) {
    if (cmd.startsWith('plugin:')) return plugin(cmd, args)
    window.__mossPending++
    try {
      const response = await fetch(`${BRIDGE}/${cmd}`, { method: 'POST', body: JSON.stringify(args) })
      const value = await response.json()
      if (!response.ok) throw value
      return value
    } finally {
      window.__mossPending--
    }
  }

  function plugin(cmd) {
    switch (cmd) {
      case 'plugin:app|version':
        return '0.1.4'
      case 'plugin:app|name':
        return 'Moss'
      case 'plugin:event|listen':
        return nextId++
      case 'plugin:updater|check':
        return null
      default:
        // Window theme, focus and friends: nothing to do without a window.
        return null
    }
  }

  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (path) => path,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
    plugins: {},
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: 'macos', os_type: 'macos', arch: 'aarch64', eol: '\n', version: '15.0' }
})()
