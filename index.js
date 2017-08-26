const chromeLauncher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const util = require('util');
const fs = require('fs');

(async function() {
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
  const { Network, Page, Console } = client;
  Network.requestWillBeSent((params) => {
    //console.log(params.request.url);
  });
  Console.messageAdded((message) => {
    ..console.log(util.inspect(message));
  });

  await Promise.all([Network.enable(), Page.enable(), Console.enable()]);

  Page.navigate({url: 'https://www.pinterest.jp/'});
  await Page.loadEventFired();
  const { data } = await Page.captureScreenshot();
  await util.promisify(fs.writeFile)('capture.png', Buffer.from(data, 'base64'));

  client.close();
  chrome.kill();
})();
