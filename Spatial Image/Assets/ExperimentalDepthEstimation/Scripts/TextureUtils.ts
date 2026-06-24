/**
 * Specs Inc. 2026
 * TextureUtils – helpers for texture readiness detection in Lens Studio.
 *
 * For ScreenCropTexture wrapping a Video texture: traverse to the underlying
 * VideoTextureProvider and use isPlaybackReady/onPlaybackReady (the canonical API).
 * For camera or unknown providers: fall back to dimension polling.
 */

/**
 * Traverses CropTextureProvider chain to find the underlying VideoTextureProvider.
 * ScreenCropTexture.control is RectCropTextureProvider (extends CropTextureProvider);
 * its inputTexture may be a Video texture whose control is VideoTextureProvider.
 */
export function getVideoTextureProvider(texture: Texture): VideoTextureProvider | null {
  if (!texture?.control) return null
  const control = texture.control
  if (control && "play" in control && "isPlaybackReady" in control) {
    return control as VideoTextureProvider
  }
  if (control && "inputTexture" in control) {
    const input = (control as CropTextureProvider).inputTexture
    if (input) return getVideoTextureProvider(input)
  }
  return null
}

/**
 * Waits for a texture to be ready for use. Uses VideoTextureProvider APIs when
 * available (isPlaybackReady, onPlaybackReady); otherwise polls dimensions.
 *
 * @param texture - The texture to wait for (may be ScreenCropTexture wrapping video)
 * @param onReady - Called when ready
 * @param createDelayedEvent - Factory for DelayedCallbackEvent (from BaseScriptComponent)
 * @param log - Optional debug logger
 */
export function waitForTextureReady(
  texture: Texture,
  onReady: () => void,
  createDelayedEvent: () => DelayedCallbackEvent,
  log?: (msg: string) => void
): void {
  const videoControl = getVideoTextureProvider(texture)
  if (videoControl) {
    if (videoControl.isPlaybackReady) {
      log?.(`Video ready: ${texture.getWidth()}x${texture.getHeight()}`)
      onReady()
      return
    }
    videoControl.onPlaybackReady.add(() => {
      log?.(`Video ready: ${texture.getWidth()}x${texture.getHeight()}`)
      onReady()
    })
    videoControl.play(-1)
    return
  }

  const w = texture.getWidth()
  const h = texture.getHeight()
  if (w > 0 && h > 0) {
    log?.(`Texture ready: ${w}x${h}`)
    onReady()
    return
  }
  const retryEvent = createDelayedEvent()
  retryEvent.bind(() => waitForTextureReady(texture, onReady, createDelayedEvent, log))
  retryEvent.reset(0.05)
}
