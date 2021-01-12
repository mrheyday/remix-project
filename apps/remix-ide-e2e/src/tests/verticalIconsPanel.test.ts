'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import sauce from './sauce'

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Checks vertical icons panelcontex menu': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('div[data-id="remixIdeIconPanel"]', 10000)
    .waitForElementVisible('*[data-id="pluginManagerComponentPluginManager"]')
    .click('*[data-id="pluginManagerComponentPluginManager"]')
    .scrollAndClick('*[data-id="pluginManagerComponentActivateButtondebugger"]')
    .waitForElementVisible('*[data-id="pluginManagerComponentDeactivateButtondebugger"]', 7000)
    .rightClick('[data-path="verticalIconsDebuggingIcons"]')
    .waitForElementVisible('*[id="menuitemdeactivate"]')
    .waitForElementVisible('*[id="menuitemdocumentation"]')
  },

  'Checks vertical icons panel contex menu deactivate': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="pluginManagerComponentPluginManager"]')
    .click('*[data-id="pluginManagerComponentPluginManager"]')
    .scrollAndClick('*[data-id="pluginManagerComponentActivateButtondebugger"]')
    .waitForElementVisible('*[data-id="pluginManagerComponentDeactivateButtondebugger"]', 7000)
    .rightClick('[data-path="verticalIconsDebuggingIcons"]')
    .click('*[id="menuitemdeactivate"]')
    .click('*[data-id="pluginManagerComponentPluginManager"]')
    .waitForElementVisible('*[data-id="pluginManagerComponentActivateButtondebugger"]')
  },

  tearDown: sauce
}
