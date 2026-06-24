/**
 * Specs Inc. 2026
 * Chess Board Predictor component for the SnapML Chess Hints Spectacles lens.
 */
import {ChessAI} from "./ChessAI"
import {BoardData, ChessPiece} from "./ChessPiece"

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {CameraService} from "./CameraService"
import {DetectionController} from "./ML/DetectionController"
import {Detection} from "./ML/DetectionHelpers"
import {RenderService} from "./RenderService"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

const STARTING_MOVE = 20 // we start with an arbitrary value to allow starting the experience mid-game
const CHESS_PIECE_DIAMETER_CM = 3.0

@component
export class ChessBoardPredictor extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ChessBoardPredictor – chess board detection and hint orchestration</span><br/><span style="color: #94A3B8; font-size: 11px;">Processes ML detections, aligns board geometry, and requests AI move suggestions.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">AI Settings</span>')
  @input()
  @hint("Use Stockfish API instead of Gemini for move suggestions")
  useStockfish: boolean = false

  @input()
  @widget(new SliderWidget(1, 12, 1))
  @showIf("useStockfish")
  @hint("Search depth for the Stockfish engine")
  AISearchDepth: number = 8

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scene References</span>')
  @input
  @hint("Camera service that provides camera frames and pose data")
  cameraService: CameraService

  @input
  @hint("Render service used to display board markers and move hints")
  renderService: RenderService

  @input
  @hint("Detection controller that visualizes bounding boxes for detected pieces")
  detectionController: DetectionController

  @input
  @hint("Debug image overlay showing the ML model input frame")
  debugImage: Image

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Textures</span>')
  @input
  @hint("Cropped camera texture fed into the ML model")
  screenCropTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Piece Prefabs</span>')
  @input
  @hint("Prefab used to instantiate white piece label overlays")
  whiteLetter: ObjectPrefab

  @input
  @hint("Prefab used to instantiate black piece label overlays")
  blackLetter: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Board UI</span>')
  @input
  @hint("Root object of the board UI panel")
  boardInterface: SceneObject

  @input
  @hint("UIKit RectangleButton that triggers the AI hint request")
  hintButton: RectangleButton

  @input
  @hint("Text component on the hint button – updated to '...' while fetching and back to 'Get Hint' when done")
  hintButtonText: Text

  @input
  @hint("UIKit RectangleButton that resets board alignment – shown on palm-up gesture")
  resetButton: RectangleButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Board Geometry</span>')
  @input
  @hint("Plane object used to define board position and orientation")
  positionPlane: SceneObject

  @input
  @hint("Left reference marker for board edge visualization")
  markerLeft: SceneObject

  @input
  @hint("Right reference marker for board edge visualization")
  markerRight: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Corner Markers</span>')
  @input
  @hint("Interactable marker for the front-left board corner (L pin)")
  cornerLeftMarker: SceneObject

  @input
  @hint("Interactable marker for the front-right board corner (R pin)")
  cornerRightMarker: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  public ai: ChessAI

  private playerSide: string = "w"

  private numMoves = STARTING_MOVE

  private isEditor: boolean = global.deviceInfoSystem.isEditor()

  private targetPosition = vec3.zero()

  private chessBoardFound = false
  private fetchingMove = false
  public boardAligned = this.isEditor

  private blackLetters: SceneObject[] = []
  private whiteLetters: SceneObject[] = []
  public boardCache: BoardData[] = []

  private isMovingLeftMarker = false
  private isMovingRightMarker = false
  private hasMovedLeftMarker = this.isEditor
  private hasMovedRightMarker = this.isEditor
  private lastBoardPosition: vec3 = vec3.zero()
  private _hintButtonPos: vec3 | null = null

  // these are the max number of detections for each class
  private classMax: {[key: string]: number} = {
    K: 1,
    k: 1,
    Q: 1,
    q: 1,
    Bb: 1,
    Bw: 1,
    bb: 1,
    bw: 1,
    b: 2,
    B: 2,
    N: 2,
    n: 2,
    R: 2,
    r: 2,
    P: 8,
    p: 8
  }

  private logger: Logger

  onAwake() {
    this.logger = new Logger("ChessBoardPredictor", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.ai = new ChessAI(this.useStockfish, this.logger)
    this.ai.depth = this.AISearchDepth

    this.setupLetters()

    this.hintButton.colliderFitElement = false
    this.resetButton.colliderFitElement = false

    this.hintButton.getSceneObject().enabled = false
    this.resetButton.getSceneObject().enabled = false
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    const interactableLeft = this.cornerLeftMarker.getComponent(Interactable.getTypeName()) as Interactable
    const interactableRight = this.cornerRightMarker.getComponent(Interactable.getTypeName()) as Interactable
    interactableLeft.onInteractorTriggerEnd(() => {
      if (!this.hasMovedLeftMarker) {
        this.hasMovedLeftMarker = true
        this.cornerRightMarker.enabled = true
        this.renderService.updateHint("Move the R Pin to the front right corner of the board")
      }

      this.isMovingLeftMarker = false
    })

    interactableRight.onInteractorTriggerEnd(() => {
      this.isMovingRightMarker = false
      this.hasMovedRightMarker = true
      this.boardAligned = true
      this._hintButtonPos = null
      this.renderService.updateHint(
        "Adjust pins as needed to align the board.  Select 'Get Hint' to get a move suggestion."
      )
      this.updateMarkers()
    })

    interactableLeft.onInteractorTriggerStart(() => {
      this.isMovingLeftMarker = true
      this._hintButtonPos = null
    })
    interactableRight.onInteractorTriggerStart(() => {
      this.isMovingRightMarker = true
      this._hintButtonPos = null
    })

    this.resetButton.onTriggerUp.add(() => {
      this.resetAlignment()
    })

    if (!this.isEditor) {
      this.resetAlignment()
      this
    }

    this.hintButton.onTriggerUp.add(() => {
      if (this.fetchingMove) {
        return
      }
      this.numMoves++
      this.renderService.resetMove()
      this.getMoveSuggestion()
      this.cornerLeftMarker.enabled = false
      this.cornerRightMarker.enabled = false
    })

    const delay = this.createEvent("DelayedCallbackEvent")
    delay.bind(() => {
      this.updateMarkers()
    })
    delay.reset(0.15)
  }

  @bindUpdateEvent
  onUpdate() {
    this.updateBoardPosition()
    this.updateUIPosition()
  }

  resetAlignment() {
    this.chessBoardFound = false
    this.cornerRightMarker.enabled = false
    this.cornerLeftMarker.enabled = false
    this.hasMovedLeftMarker = false
    this.hasMovedRightMarker = false
    this.boardAligned = false
    this.updateLetters([])
    this.hintButton.getSceneObject().enabled = false
    this.resetButton.getSceneObject().enabled = false
    this.renderService.resetMove()

    this.renderService.updateHint("Find a chess board...")
  }

  updateMarkers() {
    if (this.isEditor) {
      if (this.playerSide == "w") {
        this.markerLeft.getTransform().setLocalPosition(new vec3(1.0, 1.0, 1.6))
        this.markerRight.getTransform().setLocalPosition(new vec3(-1.0, 1.0, 1.6))
      } else {
        this.markerLeft.getTransform().setLocalPosition(new vec3(-1.0, -1.0, 1.6))
        this.markerRight.getTransform().setLocalPosition(new vec3(1.0, -1.0, 1.6))
      }
      if (this.boardAligned) {
        this.cornerLeftMarker.getTransform().setWorldPosition(this.markerLeft.getTransform().getWorldPosition())
        this.cornerRightMarker.getTransform().setWorldPosition(this.markerRight.getTransform().getWorldPosition())
        this._hintButtonPos = null
      }
    }
  }

  setupLetters() {
    const parent = this.positionPlane.getChild(0).getChild(0)
    for (let i = 0; i < 16; i++) {
      const letterBlack = this.blackLetter.instantiate(parent)
      const letterWhite = this.whiteLetter.instantiate(parent)
      letterBlack.enabled = false
      letterWhite.enabled = false

      this.blackLetters.push(letterBlack)
      this.whiteLetters.push(letterWhite)
    }
  }

  updateLetters(pieces: ChessPiece[]) {
    let blackCount = 0
    let whiteCount = 0

    const pieceOffset = {
      p: 0.0,
      r: 0.3,
      n: 0.4,
      b: 0.5,
      q: 0.7,
      k: 0.8
    }
    for (const piece of pieces) {
      const yOffset = (1.0 + pieceOffset[piece.name.toLocaleLowerCase()]) / 8.0
      const pos3d = this.boardToLocal(piece.boardPosition).add(new vec3(0, yOffset, 0))

      let letter = null
      if (piece.name.toLowerCase() == piece.name) {
        letter = this.blackLetters[blackCount]
        blackCount++
      } else {
        letter = this.whiteLetters[whiteCount]
        whiteCount++
      }

      letter.getComponent("Component.Text").text = piece.name.toUpperCase()
      letter.enabled = true
      letter.getTransform().setLocalPosition(pos3d)
      letter.getTransform().setLocalScale(vec3.one().uniformScale(0.15))
    }

    for (let i = blackCount; i < 16; i++) {
      this.blackLetters[i].enabled = false
    }
    for (let i = whiteCount; i < 16; i++) {
      this.whiteLetters[i].enabled = false
    }
  }

  updateWithDetections(detections: Detection[]) {
    const pieces = []
    for (const detection of detections) {
      const label = detection.label
      const bb = detection.bbox
      const quarterHeight = bb[3] * 0.25
      const uv = new vec2(bb[0], 1.0 - (bb[1] + quarterHeight))
      const planeY = this.positionPlane.getTransform().getWorldPosition().y
      const pos = this.unproject(uv, planeY)

      const piece = new ChessPiece(pos, label, detection.score, detection.index)
      pieces.push(piece)
    }

    const enableDetections = this.detectionController.getSceneObject().getParent().enabled
    this.debugImage.getSceneObject().enabled = enableDetections
    if (enableDetections) {
      this.detectionController.onUpdate(detections)
    }

    this.determinePlayerSide(pieces)

    if (pieces.length > 10 && !this.chessBoardFound) {
      const hint = this.boardAligned
        ? "Select 'Get Hint' to get a move suggestion."
        : "Move the L Pin to the front left corner of the board"
      this.renderService.updateHint(hint)
      this.cornerLeftMarker.enabled = true
      this.chessBoardFound = true
    }

    if (this.boardAligned) {
      this.updateFEN(pieces)
    }
  }

  // screenSpaceToUV(pos: vec2) {
  //   let uv = pos.add(vec2.one()).uniformScale(0.5);
  //   return uv;
  // }

  averageVec(arr) {
    let avg = arr[0].z == undefined ? vec2.zero() : vec3.zero()

    for (const p of arr) {
      avg = avg.add(p)
    }
    return avg.uniformScale(1.0 / arr.length)
  }

  determinePlayerSide(imagePieces: ChessPiece[]) {
    if (!this.isEditor && this.numMoves > STARTING_MOVE) {
      //let's not change sides mid-game
      return
    }

    let numWhitePieces = 0
    let numBlackPieces = 0
    let whiteAvgZ = 0
    let blackAvgZ = 0

    const camPos = this.cameraService.MainCameraPosition()

    for (let i = 0; i < imagePieces.length; i++) {
      const piece = imagePieces[i]
      if (piece.confidence < 0.5) {
        continue
      }
      const piecePos = piece.position
      piecePos.y = camPos.y
      const camDist = camPos.distance(piecePos)

      if (piece.name.toLowerCase() != piece.name) {
        numWhitePieces++
        whiteAvgZ += camDist
      } else {
        numBlackPieces++
        blackAvgZ += camDist
      }
    }
    whiteAvgZ = whiteAvgZ / numWhitePieces
    blackAvgZ = blackAvgZ / numBlackPieces

    const newSide = whiteAvgZ < blackAvgZ ? "w" : "b"

    if (newSide != this.playerSide) {
      this.playerSide = newSide
      this.updateMarkers()
      this.resetMove()
    }
  }

  //returns a 2d array of the piece locations
  getPieceLocations(imagePieces: ChessPiece[]) {
    const pieceLocations = new BoardData()

    const pieceArray: {[key: string]: ChessPiece[]} = {}

    //fill in edge rows
    let whiteCount = 0
    let blackCount = 0

    //get board positions for all pieces and count edge pieces
    imagePieces = imagePieces.filter((piece) => {
      let boardPos = piece.boardPosition
      if (boardPos.x == -1) {
        boardPos = this.worldToBoard(piece.position)
      }
      if (boardPos == null) {
        return false
      }

      //hack to handle erroneous White Pawn detections at edges
      if (boardPos.y >= 6 && piece.name == "P") {
        piece.name = "p"
      } else if (boardPos.y <= 1 && piece.name == "p") {
        piece.name = "P"
      }

      const isBlack = piece.name.toLowerCase() == piece.name

      piece.boardPosition = boardPos
      if (pieceLocations.getPiece(boardPos) == "") {
        if (boardPos.y == 7 && isBlack) {
          blackCount++
        }
        if (boardPos.y == 0 && !isBlack) {
          whiteCount++
        }
        pieceLocations.setPiece(boardPos, "-")
      }

      return true
    })

    for (let i = 0; i < imagePieces.length; i++) {
      const piece = imagePieces[i]
      const isBlack = piece.name.toLowerCase() == piece.name
      const boardPos = piece.boardPosition
      if (boardPos == null) {
        continue
      }

      //upgrade edge pieces
      const x = boardPos.x
      const y = boardPos.y

      let newName = null

      //no edge pawns
      if (boardPos.y == 7 && piece.name == "p") {
        piece.name = "b"
      } else if (boardPos.y == 0 && piece.name == "P") {
        piece.name = "B"
      }

      //assume pieces for edge rows that are nearly full
      if (boardPos.y == 7 && blackCount > 6 && isBlack) {
        if (x == 0 || x == 7) {
          newName = "r"
        } else if (x == 1 || x == 6) {
          newName = "n"
        } else if (x == 2 || x == 5) {
          newName = "b"
        } else if (x == 3) {
          newName = "q"
        } else if (x == 4) {
          newName = "k"
        }
      }

      //assume pieces for edge rows that are nearly full
      if (boardPos.y == 0 && whiteCount > 6 && !isBlack) {
        if (x == 0 || x == 7) {
          newName = "R"
        } else if (x == 1 || x == 6) {
          newName = "N"
        } else if (x == 2 || x == 5) {
          newName = "B"
        } else if (x == 3) {
          newName = "Q"
        } else if (x == 4) {
          newName = "K"
        }
      }

      if (newName != null) {
        piece.name = newName
        piece.confidence = 1.0
      }

      if (pieceArray[piece.name] == undefined) {
        pieceArray[piece.name] = []
      }

      //penalize pawn confidence by distance from edge
      if (piece.name == "p") {
        piece.confidence -= (6 - boardPos.y) * 0.02
      } else if (piece.name == "P") {
        piece.confidence -= (boardPos.y - 1) * 0.02
      }

      pieceArray[piece.name].push(piece)
    }

    const counts = {
      k: 0,
      q: 0,
      bb: 0,
      bw: 0,
      b: 0,
      n: 0,
      r: 0,
      p: 0,
      K: 0,
      Q: 0,
      Bb: 0,
      Bw: 0,
      B: 0,
      N: 0,
      R: 0,
      P: 0
    }

    const downgrades = {
      K: "Q",
      Q: "B",
      B: "P",
      N: "R",
      R: "P",
      k: "q",
      q: "b",
      b: "p",
      n: "r",
      r: "p"
    }

    const finalPieces = []

    for (const pieceName in counts) {
      if (pieceArray[pieceName] != undefined) {
        const pieces = pieceArray[pieceName]
        //sort pieces by confidence
        pieces.sort((a, b) => {
          return b.confidence - a.confidence
        })

        while (pieces.length > 0) {
          const piece = pieces.shift()

          const pieceAtPosition = pieceLocations.getPiece(piece.boardPosition)
          if (pieceAtPosition == "" || pieceAtPosition == "-") {
            pieceLocations.setPiece(piece.boardPosition, "")
            //make sure we have at least one king
            const k = piece.name.toLowerCase() == piece.name ? "k" : "K"
            if (piece.name.toLowerCase() != "k" && counts[k] < this.classMax[k]) {
              piece.name = k
            }

            //handle bishop square colors
            let pieceName = piece.name
            if (pieceName.toLowerCase() == "b") {
              const squareColor = (piece.boardPosition.x + piece.boardPosition.y) % 2 == 0 ? "b" : "w"
              pieceName += squareColor
            }

            if (counts[pieceName] < this.classMax[pieceName]) {
              counts[pieceName]++
              pieceLocations.setPiece(piece.boardPosition, piece.name)
              finalPieces.push(piece)
              if (piece.name == "K") {
                this.renderService.screenImage.mainPass.board_vector = this.worldToImage(piece.position)
              }
            } else if (piece.name.toLowerCase() != "p") {
              const downgrade = downgrades[piece.name]
              if (downgrade.toLowerCase() == "p" && (piece.boardPosition.y == 7 || piece.boardPosition.y == 0)) {
                continue
              }

              piece.name = downgrade
              if (pieceArray[piece.name] == undefined) {
                pieceArray[piece.name] = []
              }
              pieceArray[piece.name].push(piece)
            }
          }
        }
      }
    }

    let finalLocations = new BoardData()

    if (this.boardAligned) {
      this.boardCache.push(pieceLocations)

      const CACHE_SIZE = 10
      if (this.boardCache.length > CACHE_SIZE) {
        this.boardCache.shift()
      }

      if (this.boardCache.length < 3) {
        finalLocations = pieceLocations
      } else {
        const finalCounts = {
          k: 0,
          q: 0,
          b: 0,
          n: 0,
          r: 0,
          p: 0,
          K: 0,
          Q: 0,
          B: 0,
          N: 0,
          R: 0,
          P: 0
        }

        for (let x = 0; x < 8; x++) {
          for (let y = 0; y < 8; y++) {
            const loc = new vec2(x, y)
            const pieces = {}

            for (const board of this.boardCache) {
              let piece = board.getPiece(loc)
              if (piece == "-") {
                piece = ""
              }
              if (finalCounts[piece] < this.classMax[piece]) {
                pieces[piece] = (pieces[piece] || 0) + 1
              }
            }
            const maxPiece = Object.keys(pieces).reduce((a, b) => (pieces[a] > pieces[b] ? a : b), "")
            if (pieces[maxPiece] >= 3) {
              finalLocations.setPiece(loc, maxPiece)
              finalCounts[maxPiece]++
            }
          }
        }
      }
    }

    this.updateLetters(finalLocations.getPieces())

    return finalLocations
  }

  rectToBbox(rect: Rect): [number, number, number, number] {
    const x = (rect.left + rect.right) / 2
    const y = (rect.top + rect.bottom) / 2
    const w = rect.right - rect.left
    const h = rect.top - rect.bottom

    return [0.5 * (x + 1), 0.5 * (1 - y), 0.5 * w, 0.5 * h] // Return as [x, y, w, h]
  }

  notationToBoard(notation: string) {
    const row = notation.charCodeAt(1) - "0".charCodeAt(0) - 1
    const col = notation.charCodeAt(0) - "a".charCodeAt(0)

    return new vec2(col, row)
  }

  boardToNotation(board: vec2) {
    const col = board.x + "a".charCodeAt(0)
    const row = board.y + "0".charCodeAt(0) + 1
    return String.fromCharCode(col) + String.fromCharCode(row)
  }

  getMoveSuggestion(retryCount: number = 0) {
    this.ai.suggestedMove = null
    this.fetchingMove = true
    this.renderService.updateHint("🤖 Thinking...")
    if (this.hintButtonText) this.hintButtonText.text = "..."
    this.ai.fetchMove((response) => {
      this.renderService.shouldRenderMove = response.success
      if (response.success && this.ai.suggestedMove != null) {
        const friendlyPiece = this.ai.pieceToFriendlyName(this.ai.suggestedMove.piece)
        const moveStr =
          friendlyPiece +
          "\n" +
          this.ai.suggestedMove.from.toUpperCase() +
          " to " +
          this.ai.suggestedMove.to.toUpperCase()
        this.renderService.updateHint(moveStr)
        this.fetchingMove = false
      } else {
        if (retryCount < 3 && response.shouldRetry) {
          const delay = this.createEvent("DelayedCallbackEvent")
          this.renderService.updateHint("Adjust your view to center on the board from about 2 feet away")
          delay.bind(() => {
            this.getMoveSuggestion(retryCount + 1)
          })
          delay.reset(2.0)
        } else {
          if (response.message.includes("wrong FEN")) {
            this.renderService.updateHint("Bad FEN: " + response.fen)
          } else {
            this.renderService.updateHint("Error: " + response.message)
          }
          this.fetchingMove = false
        }
      }
      if (this.hintButtonText) this.hintButtonText.text = "Get Hint"
    })
  }

  updateFEN(imagePieces: ChessPiece[]) {
    const pieceLocations = this.getPieceLocations(imagePieces)

    const pieces = pieceLocations.getPieces()
    const hasWhiteKing = pieces.some((p) => p.name === "K")
    const hasBlackKing = pieces.some((p) => p.name === "k")
    if (!hasWhiteKing || !hasBlackKing) return

    const FEN = this.ai.boardArrayToFEN(pieceLocations, this.playerSide, this.numMoves)

    this.ai.updateFEN(FEN)

    const didFindBoard = this.ai.lastFEN != null && this.playerSide != ""
    const shouldShowHint = this.boardAligned && didFindBoard

    if (this.hintButton.getSceneObject().enabled !== shouldShowHint) {
      this.hintButton.getSceneObject().enabled = shouldShowHint
    }

    this.updateRendering()
  }

  resetMove() {
    this.boardCache = []
    this.ai.reset()
    this.renderService.resetMove()
    this.renderService.updateHint("Select 'Get Hint' to get another move")
  }

  updateRendering() {
    if (this.ai.suggestedMove != null) {
      const start = this.notationToBoard(this.ai.suggestedMove.from)
      const end = this.notationToBoard(this.ai.suggestedMove.to)

      //check to see if the player made the suggested move, and if so, reset the hint
      const pieces = {}
      for (const board of this.boardCache) {
        let piece = board.getPiece(end)
        if (piece == "-") {
          piece = ""
        }

        pieces[piece] = (pieces[piece] || 0) + 1
      }

      //check to see if the player made the suggested move, and if so, reset the hint
      const maxPiece = Object.keys(pieces).reduce((a, b) => (pieces[a] > pieces[b] ? a : b), "")
      if (pieces[maxPiece] > 5 && maxPiece == this.ai.suggestedMove.piece) {
        this.resetMove()
      }

      let posStart = null
      let posEnd = null

      //lets update the 3d points if needed when the hit tests finish
      const checkPoints = () => {
        if (posStart == null || posEnd == null) {
          return
        }
        this.renderService.moveStartPos = posStart
        this.renderService.moveEndPos = posEnd
      }

      this.renderService.moveStartPosImage = this.boardToImage(start)
      this.renderService.moveEndPosImage = this.boardToImage(end)

      posStart = this.boardToWorld(start)
      posEnd = this.boardToWorld(end)

      checkPoints()
    }
  }

  updateBoardPosition() {
    const lh = SIK.HandInputData.getHand("left")
    const angle = lh.getFacingCameraAngle()
    const palmLeftUp = angle != null && angle < 50

    if (this.resetButton.getSceneObject().enabled !== palmLeftUp) {
      this.resetButton.getSceneObject().enabled = palmLeftUp
    }

    const palmPosition = lh.middleKnuckle.position
    const palmDirection = lh.middleKnuckle.right
    const palmForward = lh.middleKnuckle.forward
    if (palmPosition != null) {
      this.resetButton
        .getSceneObject()
        .getTransform()
        .setWorldPosition(palmPosition.add(palmDirection.uniformScale(7.0).add(palmForward.uniformScale(2.0))))
    }

    const mesh = this.positionPlane.getChild(0).getComponent("Component.RenderMeshVisual")
    mesh.enabled =
      this.hasMovedLeftMarker && (this.isMovingRightMarker || (this.isMovingLeftMarker && this.hasMovedRightMarker))

    const interfacePosition = this.boardInterface.getTransform().getWorldPosition()

    if (this.cornerLeftMarker.enabled && !(this.hasMovedLeftMarker || this.isMovingLeftMarker)) {
      this.cornerLeftMarker.getTransform().setWorldPosition(interfacePosition)
    }

    if (this.cornerRightMarker.enabled && !this.hasMovedRightMarker && !this.isMovingRightMarker) {
      this.cornerRightMarker.getTransform().setWorldPosition(interfacePosition)
    }

    this.cornerLeftMarker.getChild(1).enabled = this.isMovingLeftMarker || !this.hasMovedLeftMarker
    this.cornerRightMarker.getChild(1).enabled = this.isMovingRightMarker || !this.hasMovedRightMarker

    const isMoving = this.isMovingLeftMarker || this.isMovingRightMarker

    const frontLeft = this.cornerLeftMarker.getTransform().getWorldPosition()
    const frontRight = this.cornerRightMarker.getTransform().getWorldPosition()

    if (isMoving || this.lastBoardPosition.distance(frontLeft) > 1.0) {
      const scale = frontLeft.distance(frontRight)

      // Calculate the distance between the two index tips
      const distance = frontLeft.distance(frontRight)

      // Set the position of the plane to the center point
      this.positionPlane.getTransform().setWorldPosition(frontLeft)

      // Calculate the rotation angle based on the positions of the index tips
      const direction = frontRight.sub(frontLeft).normalize()
      const angleY = Math.atan2(direction.x, direction.z) // Rotate only on the Y axis

      // Set the rotation of the plane
      this.positionPlane.getTransform().setWorldRotation(quat.fromEulerAngles(0, angleY, 0))

      // Scale the plane based on the distance between the index tips
      this.positionPlane.getTransform().setWorldScale(vec3.one().uniformScale(scale))

      this.lastBoardPosition = frontLeft
    }
  }

  getInterfaceDistance(): [vec3, vec3, number] {
    const currentPosition = this.boardInterface.getTransform().getWorldPosition()

    const cameraPosition = this.cameraService.MainCameraPosition()
    const dir = this.cameraService.mainCamera.getTransform().forward

    const targetPosition = cameraPosition.add(dir.uniformScale(-40))
    const distance = currentPosition.distance(targetPosition)

    return [currentPosition, targetPosition, distance]
  }

  private closestPointOnSegment(a: vec3, b: vec3, p: vec3): vec3 {
    const ab = b.sub(a)
    const lenSq = ab.dot(ab)
    if (lenSq < 1e-6) return a
    const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / lenSq))
    return a.add(ab.uniformScale(t))
  }

  updateUIPosition() {
    if (this.boardAligned) {
      this.boardInterface.getChild(0).getComponent("LookAtComponent").enabled = false
      this.boardInterface
        .getChild(0)
        .getTransform()
        .setLocalRotation(quat.fromEulerAngles(0, 0, 0))
      const offset = quat.fromEulerAngles(0, -Math.PI / 2, 0)
      const rot = this.positionPlane.getTransform().getWorldRotation().multiply(offset)
      const transform = this.positionPlane.getTransform().getWorldTransform()
      const pos = transform.multiplyPoint(new vec3(1.0, 0.5, 0.5))
      this.boardInterface.getTransform().setWorldPosition(pos)
      this.boardInterface.getTransform().setWorldRotation(rot)

      // Slide the hint button along the front edge (cornerLeft → cornerRight) to
      // the closest point to the camera. This decouples button position from
      // positionPlane's fixed local offset and keeps it in front of the player.
      const frontLeft = this.cornerLeftMarker.getTransform().getWorldPosition()
      const frontRight = this.cornerRightMarker.getTransform().getWorldPosition()
      const scale = frontLeft.distance(frontRight)
      const camPos = this.cameraService.MainCameraPosition()
      const closest = this.closestPointOnSegment(frontLeft, frontRight, camPos)
      const newPos = new vec3(closest.x, frontLeft.y + scale * 0.1, closest.z)
      if (this._hintButtonPos === null) {
        this._hintButtonPos = newPos
        this.hintButton.getSceneObject().getTransform().setWorldPosition(newPos)
      } else {
        const dist = this._hintButtonPos.distance(newPos)
        if (dist > 1.0) {
          const lerped = vec3.lerp(this._hintButtonPos, newPos, getDeltaTime() * 5)
          this._hintButtonPos = lerped
          this.hintButton.getSceneObject().getTransform().setWorldPosition(lerped)
        }
      }
      return
    } else {
      this.boardInterface.getChild(0).getComponent("LookAtComponent").enabled = true
    }

    let [currentPosition, targetPosition, distance] = this.getInterfaceDistance()

    if (distance > 4) {
      this.targetPosition = targetPosition
    }

    if (distance == Infinity) {
      distance = 10
    }

    const lerpFactor = getDeltaTime() * 0.5 * Math.max(distance, 10)
    let newPosition = vec3.lerp(currentPosition, this.targetPosition, lerpFactor)
    if (distance > 30) {
      newPosition = this.targetPosition
    }
    this.boardInterface.getTransform().setWorldPosition(newPosition)

    return distance
  }

  worldToBoard(pos3d: vec3) {
    const transform = this.positionPlane.getTransform().getInvertedWorldTransform()
    const localPos = transform.multiplyPoint(pos3d)

    const row = Math.floor(localPos.x * 8.0)
    const col = Math.floor(localPos.z * 8.0)

    let rowRounded = Math.min(Math.max(row, 0), 7)
    const colRounded = Math.min(Math.max(col, 0), 7)

    if (rowRounded != row || colRounded != col) {
      //piece off board
      return null
    }

    if (this.playerSide == "b") {
      rowRounded = 7 - rowRounded
      //colRounded = 7 - colRounded;
    }

    return new vec2(colRounded, rowRounded)
  }

  boardToLocal(pos: vec2) {
    if (this.playerSide == "b") {
      pos.y = 7 - pos.y
    }
    const pos3d = new vec3(pos.y + 0.5, 0, pos.x + 0.5).uniformScale(1.0 / 8.0)
    return pos3d
  }

  boardToWorld(pos: vec2) {
    const y = this.playerSide == "b" ? 7.0 - pos.y : pos.y
    const pos3d = new vec3(y + 0.5, 0, pos.x + 0.5).uniformScale(1.0 / 8.0)
    const transform = this.positionPlane.getTransform().getWorldTransform()
    return transform.multiplyPoint(pos3d)
  }

  worldToImage(pos: vec3) {
    if (!this.cameraService.cameraModel) {
      return vec2.zero()
    }
    const transform = this.cameraService.WorldToCaptureTransform()
    const imagePos = transform.multiplyPoint(pos)

    return this.cameraService.cameraModel.projectToUV(imagePos)
  }

  boardToImage = (pos: vec2) => {
    const worldPos = this.boardToWorld(pos)
    return this.worldToImage(worldPos)
  }

  //convert from screen space to world space of a known plane
  unproject(uv: vec2, planeY: number, planeOffset: number = 0) {
    const uvUncropped = this.cameraService.uvToUncroppedUV(uv)
    const unprojectedCameraSpace = this.cameraService.cameraModel.unprojectFromUV(uvUncropped, 1.0)

    const unprojectedWorldSpace = this.cameraService.CaptureToWorldTransform().multiplyPoint(unprojectedCameraSpace)

    // Get the known Y value in world space
    const knownY = planeY + planeOffset

    // Get camera position in world space
    const cameraPos = this.cameraService.DeviceCameraPosition()

    // This gives us a direction vector in world space
    const dir = unprojectedWorldSpace.sub(cameraPos).normalize()

    // Calculate the scale factor to reach the known Y plane
    // We need to solve: cameraPos.y + dir.y * t = knownY
    // Therefore: t = (knownY - cameraPos.y) / dir.y
    const t = (knownY - cameraPos.y) / dir.y

    // Calculate the final world position
    const worldPos = cameraPos.add(dir.uniformScale(t))
    return worldPos
  }
}
