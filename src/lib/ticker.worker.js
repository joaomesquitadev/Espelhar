// Timers in a Web Worker are not throttled when the tab is in the background, unlike setInterval on the page.
setInterval(() => postMessage(0), 1000)
