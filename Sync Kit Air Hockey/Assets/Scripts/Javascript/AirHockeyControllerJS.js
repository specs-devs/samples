//@component
// AirHockeyController.js
// Description: Controls the game flow in the Air Hockey example.

// @input Component.ScriptComponent puck
// @input Physics.ColliderComponent leftGoalCollider
// @input Physics.ColliderComponent rightGoalCollider
// @input Component.ScriptComponent leftPaddle
// @input Component.ScriptComponent rightPaddle
// @input SceneObject startGameButtonObj
// @input Component.Text leftScore1
// @input Component.Text rightScore1
// @input Component.Text leftScore2
// @input Component.Text rightScore2

const puck = script.puck;
const leftGoalCollider = script.leftGoalCollider;
const rightGoalCollider = script.rightGoalCollider;
const leftPaddle = script.leftPaddle;
const rightPaddle = script.rightPaddle;
const startGameButtonObj = script.startGameButtonObj;
const leftScore1 = script.leftScore1;
const rightScore1 = script.rightScore1;
const leftScore2 = script.leftScore2;
const rightScore2 = script.rightScore2;

const Interactable = require("InteractionKit.lspkg/Components/Interaction/Interactable/Interactable").Interactable;
const InteractableManipulation = require("InteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation").InteractableManipulation;
const RectangleButton = require("UIKit.lspkg/Scripts/Components/Button/RectangleButton").RectangleButton;

let isLeftPlayer;
let isRightPlayer;
let hasInitAsOwner;

let syncEntity;
let leftScoreProp;
let rightScoreProp;
let isGameStartedProp;

let startGameButton;

let leftPaddleInteractable;
let rightPaddleInteractable;

let leftPaddleManipulation;
let rightPaddleManipulation;

function isHost() {
  return syncEntity.isSetupFinished && syncEntity.doIOwnStore();
}

function refreshUI() {
  const isConnected = syncEntity.isSetupFinished;
  startGameButtonObj.enabled =
    isConnected && isHost() && !isGameStartedProp.currentOrPendingValue && puck.syncEntity.doIOwnStore();
}

function setupForLeftSide() {
  leftPaddle.syncEntity.tryClaimOwnership(function () {
    isLeftPlayer = true;
    leftPaddleManipulation.setCanTranslate(true);
    refreshUI();
  });
}

function setupForRightSide() {
  rightPaddle.syncEntity.tryClaimOwnership(function () {
    isRightPlayer = true;
    rightPaddleManipulation.setCanTranslate(true);
    refreshUI();
  });
}

// Start Button Callback

function startGame() {
  print("Start button pinched");
  if (!isGameStartedProp.currentOrPendingValue) {
    isGameStartedProp.setValueImmediate(syncEntity.currentStore, true);
    refreshUI();
    print("Start game");
    puck.startMovement();
  }
}

// Interactable Callbacks

function joinLeft() {
  if (!isLeftPlayer && !isRightPlayer && !leftPaddle.syncEntity.isStoreOwned()) {
    setupForLeftSide();
  }
}

function joinRight() {
  if (!isLeftPlayer && !isRightPlayer && !rightPaddle.syncEntity.isStoreOwned()) {
    setupForRightSide();
  }
}

// Collider Callbacks

function onLeftGoalOverlap(eventArgs) {
  const overlap = eventArgs.overlap;
  if (overlap.collider.isSame(puck.bodyComponent)) {
    print("Goal on left!");
    puck.resetPuck();
    rightScoreProp.setPendingValue(rightScoreProp.currentOrPendingValue + 1);
  }
}

function onRightGoalOverlap(eventArgs) {
  const overlap = eventArgs.overlap;
  if (overlap.collider.isSame(puck.bodyComponent)) {
    print("Goal on right!");
    puck.resetPuck();
    leftScoreProp.setPendingValue(leftScoreProp.currentOrPendingValue + 1);
  }
}

// SyncEntity Callbacks

function onSyncEntityReady() {
  if (isHost()) {
    initAsOwner();
  } else {
    initAsClient();
  }

  leftPaddleInteractable.onHoverEnter.add(joinLeft);
  rightPaddleInteractable.onHoverEnter.add(joinRight);

  leftPaddle.syncEntity.onOwnerUpdated.add(refreshUI);
  rightPaddle.syncEntity.onOwnerUpdated.add(refreshUI);
  puck.syncEntity.onOwnerUpdated.add(refreshUI);

  refreshUI();
}

function onOwnershipUpdated() {
  if (!syncEntity.isStoreOwned()) {
    print("Controller is not owned, trying to claim");
    syncEntity.tryClaimOwnership(initAsOwner);
  }
  refreshUI();
}

function setLeftScore(newScore, oldScore) {
  leftScore1.text = "" + newScore;
  leftScore2.text = "" + newScore;
}

function setRightScore(newScore, oldScore) {
  rightScore1.text = "" + newScore;
  rightScore2.text = "" + newScore;
}

// Initialization -----

function initAsClient() {
  refreshUI();
}

function initAsOwner() {
  if (hasInitAsOwner) return;

  hasInitAsOwner = true;

  leftGoalCollider.onOverlapEnter.add(onLeftGoalOverlap);
  rightGoalCollider.onOverlapEnter.add(onRightGoalOverlap);
  startGameButton.onTriggerUp.add(startGame);

  print("Trying to claim ownership of puck");
  puck.syncEntity.tryClaimOwnership(refreshUI);

  refreshUI();
}

function onSessionReady() {
  startGameButton = startGameButtonObj.getComponent(RectangleButton.getTypeName());

  leftPaddleInteractable = leftPaddle.getSceneObject().getComponent(Interactable.getTypeName());
  rightPaddleInteractable = rightPaddle.getSceneObject().getComponent(Interactable.getTypeName());

  leftPaddleManipulation = leftPaddle.getSceneObject().getComponent(InteractableManipulation.getTypeName());
  rightPaddleManipulation = rightPaddle.getSceneObject().getComponent(InteractableManipulation.getTypeName());

  leftPaddleManipulation.setCanTranslate(false);
  leftPaddleManipulation.setCanScale(false);
  leftPaddleManipulation.setCanRotate(false);

  rightPaddleManipulation.setCanTranslate(false);
  rightPaddleManipulation.setCanScale(false);
  rightPaddleManipulation.setCanRotate(false);

  isLeftPlayer = false;
  isRightPlayer = false;
  hasInitAsOwner = false;

  syncEntity = new SyncEntity(script, null, true);

  isGameStartedProp = syncEntity.addStorageProperty(StorageProperty.manualBool("isGameStarted", false));
  leftScoreProp = syncEntity.addStorageProperty(StorageProperty.manualInt("leftScore", 0));
  rightScoreProp = syncEntity.addStorageProperty(StorageProperty.manualInt("rightScore", 0));

  leftScoreProp.onAnyChange.add(setLeftScore);
  rightScoreProp.onAnyChange.add(setRightScore);

  syncEntity.notifyOnReady(onSyncEntityReady);
  syncEntity.onOwnerUpdated.add(onOwnershipUpdated);

  refreshUI();

  print("Controller initialized.");
}

function init() {
  global.sessionController.notifyOnReady(onSessionReady);
}

script.createEvent("OnStartEvent").bind(init);
