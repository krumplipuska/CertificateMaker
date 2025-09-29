'use strict';
(function(){
  window.App = window.App || {};
  window.App.modules = window.App.modules || {};
  // Bootstrap that can later orchestrate module inits prior to editor.app.js
  function init(){
    try {
      (window.App.modules.updateApi && window.App.modules.updateApi.init && window.App.modules.updateApi.init());
      (window.App.modules.hub && window.App.modules.hub.init && window.App.modules.hub.init());
      (window.App.modules.uiPanels && window.App.modules.uiPanels.init && window.App.modules.uiPanels.init());
      (window.App.modules.colorPicker && window.App.modules.colorPicker.init && window.App.modules.colorPicker.init());
      (window.App.modules.properties && window.App.modules.properties.init && window.App.modules.properties.init());
      (window.App.modules.toolbar && window.App.modules.toolbar.init && window.App.modules.toolbar.init());
      (window.App.modules.interactions && window.App.modules.interactions.init && window.App.modules.interactions.init());
    } catch {}
  }
  window.App.bootstrap = { init };
  // Do not auto-run; `editor.app.js` already owns DOMContentLoaded
})();


