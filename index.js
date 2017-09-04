const chromeLauncher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');

const util = require('util');
const fs = require('fs');
const cmdr = require('commander');

cmdr
  .version('0.1.0')
  .option('--without-capture', 'no capture')
  .option('--without-dom-output', 'no output dump dom')
  .option('--without-log', 'no output chrome\'s console logs')
  .parse(process.argv);

const scrollToBottom = () => new Promise((resolve) => {
  const interval = setInterval(() => {
    if (window.document.body.scrollTop + window.innerHeight < window.document.body.scrollHeight) {
      window.document.body.scrollTop += window.innerHeight;
    } else {
      clearInterval(interval);
      window.document.body.scrollTop = 0;
      resolve();
    }
  }, 200);
});
const scrollToBottomScript = `(${scrollToBottom.toString()})()`;

const dumpopts = {
  url: cmdr.args[0],
  device: null,
  capture: !cmdr.withoutCapture,
  outputDom: !cmdr.withoutDomOutput,
  outputLog: !cmdr.withoutLog,
};

const dump = async (options) => {
  const chrome = await chromeLauncher.launch({
    port: 9222,
    chromePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
    chromeFlags: [
      '--headless',
      '--disable-gpu',
      '--no-sandbox'
    ]
  });

  const client = await CDP();
  const { Network, Page, Console, DOM, Runtime, Emulation } = client;

  let logs = [];

  Console.messageAdded((l) => {
    logs.push(l);
  });

  await Promise.all([Network.enable(), Page.enable(), Console.enable(), DOM.enable()]);

  try {
    await Emulation.setDeviceMetricsOverride({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 0,
      mobile: false,
      fitWindow: false
    });

     Page.navigate({url: options.url});
    await Page.loadEventFired();
  
    await Runtime.evaluate({ expression: scrollToBottomScript, awaitPromise: true });
  
    const getPageSize = () => JSON.stringify({
      width: window.document.body.scrollWidth,
      height: window.document.body.scrollHeight,
    });
    const { result: {value} } = await Runtime.evaluate({
      expression: `(${getPageSize})()`,
      returnByValue: true
    });
    const { width, height } = JSON.parse(value);
    await Emulation.setDeviceMetricsOverride({
      width: 1920,
      height: height,
      deviceScaleFactor: 0,
      mobile: false,
      fitWindow: false
    });
  
    await Emulation.setVisibleSize({ width, height });

    let r = {
      url: options.url,
      capturePath: '',
      dom: '',
      log: []
    };
  
    if (options.capture) {
      const { data } = await Page.captureScreenshot();
      r.capturePath = (new Date).getTime() + '.png';
      await util.promisify(fs.writeFile)(r.capturePath, Buffer.from(data, 'base64'));
    }
  
    if (options.outputDom) {
      const dom = await DOM.getDocument();
      const html = await DOM.getOuterHTML({nodeId: dom.root.nodeId});
      r.dom = html;
    }
  
    if (options.outputLog) {
      logs.forEach((v, i, a) => {
        r.log.push(v.message.level + '\t' + v.message.text.replace(/\n/g, '\\n'));
      });
    }

    console.log(JSON.stringify(r));
  } catch (error) {
    console.error(error);
  } finally {
    client.close();
    chrome.kill();
  }
};

dump(dumpopts);
