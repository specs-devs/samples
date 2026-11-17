//@component
/**
 * SPECS Inc. 2027
 * Defines append Line, create Session Async for the Mobile Kit lens.
 */
// @input bool resetAfterDelay = false
// @input Component.Image image
// @input SceneObject gltfContainer
// @input Asset.Material gltfMaterial
// @input Component.Text logText

const module = require("LensStudio:SpectaclesMobileKitModule");
const internetModule = require("LensStudio:InternetModule");

let mainPass;
let session = null;
// Each test run gets a number, so callbacks of a stopped run are ignored.
let run = 0;
let started = false;
let initialLogText = "";

// Lines kept on the on-screen log below its title.
const LOG_LINES = 9;

function appendLine(txt) {
  print(txt);
  if (script.logText) {
    // Keep the title and only the newest lines, so the log never grows over the rest of the Lens.
    const lines = script.logText.text.split("\n");
    lines.push(txt);
    script.logText.text = [lines[0]].concat(lines.slice(1).slice(-LOG_LINES)).join("\n");
  }
}

function createSessionAsync(onDisconnect) {
  return new Promise((resolve, reject) => {
    const newSession = module.createSession();
    // Kept right away so stopSession() can also close a session that hasn't connected yet.
    session = newSession;
    newSession.onDisconnected.add(onDisconnect);
    newSession.onConnected.add(() => {
      resolve(newSession);
    });
    newSession.start();
  });
}

function onStart() {
  script.image.mainMaterial = script.image.mainMaterial.clone();
  mainPass = script.image.mainPass;
  // The log's first line is its title; appendLine() adds everything after it.
  initialLogText = script.logText ? script.logText.text.split("\n")[0] : "";
  started = true;
  runTest();
}

function stopSession() {
  run += 1;
  if (session) {
    print("Stopping the session");
    session.close();
    session = null;
  }
}

async function runTest() {
  stopSession();
  const thisRun = run;
  const live = () => thisRun === run;
  if (script.logText) {
    script.logText.text = initialLogText;
  }
  // A mesh left by an earlier run would pile up under the new one.
  for (let i = script.gltfContainer.getChildrenCount() - 1; i >= 0; i--) {
    script.gltfContainer.getChild(i).destroy();
  }

  appendLine("Script Started");
  try {
    appendLine("Awaiting connection");

    if (script.resetAfterDelay) {
      const delay = script.createEvent("DelayedCallbackEvent");
      delay.bind(() => {
        if (live()) {
          appendLine("Stopping the session");
          stopSession();
        }
      });
      delay.reset(10);
    }

    const session = await createSessionAsync(() => {
      if (live()) {
        appendLine("Disconnected");
        // Start over shortly after the phone disconnects, so the Lens reconnects when it comes back.
        const delay = script.createEvent("DelayedCallbackEvent");
        delay.bind(() => {
          if (live()) {
            runTest();
          }
        });
        delay.reset(1);
      }
    });
    if (!live()) {
      return;
    }

    appendLine("Client Connected");

    // oneway, not expecting a response
    session.sendData("test data");
    appendLine("Sent data");

    // request-app-digest
    // This "app://digest" request is not sent to the mobile app for processing.
    // It is called to get the digest of the connected mobile app,
    // allowing the Lens to determine whether the connected app is trustworthy.
    try {
      const response = await session.sendRequest("app://digest");
      if (!live()) return;
      appendLine(`Digest: ${response}`);
    } catch (error) {
      if (!live()) return;
      appendLine(`Error: ${error}`);
    }

    // request-response
    try {
      const response = await session.sendRequest("echo me back");
      if (!live()) return;
      appendLine(`Response: ${response}`);
    } catch (error) {
      if (!live()) return;
      appendLine(`Error: ${error}`);
    }

    if (!live()) {
      return;
    }

    // subscribe to a topic
    const subscription = session.startSubscription("hello world times", (error) => {
      appendLine(`Subscription error: ${error}`);
    });
    subscription.add((response) => {
      appendLine(`Subscription response: ${response}`);
    });

    const textureId = "spectacleskit://test.png";
    const textureResource = internetModule.makeResourceFromUrl(textureId);
    appendLine(`Loading asset: ${textureId}`);
    const remoteMediaModule = require("LensStudio:RemoteMediaModule");
    remoteMediaModule.loadResourceAsImageTexture(
      textureResource,
      (texture) => {
        if (!live()) return;
        appendLine("Texture downloaded");
        // Downloading only fetches the bytes. The texture's provider is still unloaded and
        // would be loaded synchronously mid-render on first draw, so await ensureLoaded()
        // before assigning it. Requires Lens Scripting 370+ (this project is on 372).
        texture.control
          .ensureLoaded()
          .then(() => {
            if (!live()) return;
            appendLine("Texture loaded");
            mainPass.baseTex = texture;
          })
          .catch((error) => {
            appendLine(`Error loading texture: ${error}`);
          });
      },
      (error) => {
        appendLine(`Error loading asset: ${error}`);
      }
    );

    const meshId = "spectacleskit://test.glb";
    const meshResource = internetModule.makeResourceFromUrl(meshId);
    appendLine(`Loading asset: ${meshId}`);
    remoteMediaModule.loadResourceAsGltfAsset(
      meshResource,
      (asset) => {
        if (!live()) return;
        appendLine("Mesh loaded");
        asset.tryInstantiate(script.gltfContainer, script.gltfMaterial);
        // TODO: you can now find a new object in script.gltfContainer and change its textures
      },
      (error) => {
        appendLine(`Error loading asset: ${error}`);
      }
    );

    // try other asset types:
    // remoteMediaModule.loadResourceAsAudioTrackAsset('spectacleskit://test_asset.gif', ( texture )=> {
    // remoteMediaModule.loadResourceAsVideoTexture('spectacleskit://test_asset.webp', ( texture )=> {
    // remoteMediaModule.loadResourceAsAudioTrackAsset('spectacleskit://test_asset.wav', ( asset )=> {

    // downloadAsset wouldn't work
    // it only supports assets compressed with our proprietary format
    // script.asset.downloadAsset(( asset )=> {

    // stop the subscription
    // session.stopSubscription(subscription)
  } catch (error) {
    appendLine(`Mobile Kit is not available: ${error}`);
  }
}

async function onAwake() {
  script.createEvent("OnStartEvent").bind(() => {
    onStart();
  });
  // Only one of the TS / JS versions runs at a time: when this one is turned off its session is
  // closed, and when it is turned on again the test starts over.
  script.createEvent("OnDisableEvent").bind(() => {
    stopSession();
  });
  script.createEvent("OnEnableEvent").bind(() => {
    if (started) {
      runTest();
    }
  });
}

// Initialize the script
onAwake();
