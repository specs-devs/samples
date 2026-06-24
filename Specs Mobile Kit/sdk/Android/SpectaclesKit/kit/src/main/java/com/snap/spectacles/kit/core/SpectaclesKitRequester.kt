package com.snap.spectacles.kit.core

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.snap.spectacles.kit.ClientException
import java.io.Closeable
import java.util.concurrent.atomic.AtomicReference
import java.util.function.Consumer

internal const val SPECTACLES_KIT_EXTRA_ACTION = "SpecsAction"
internal const val SPECTACLES_KIT_EXTRA_PACKAGE = "SpecsPackage"

private const val SPECTACLES_APP_MIN_VERSION_CODE = 5638L
private val SPECTACLES_APP_VARIANTS = arrayOf(
    "com.snap.spectacles.app" to SPECTACLES_APP_MIN_VERSION_CODE,
    "com.snap.spectacles.app.beta" to SPECTACLES_APP_MIN_VERSION_CODE,
    "com.snap.spectacles.app.alpha" to SPECTACLES_APP_MIN_VERSION_CODE,
    "com.snap.spectacles.app.master" to SPECTACLES_APP_MIN_VERSION_CODE,
    "com.snap.spectacles.app.dev" to SPECTACLES_APP_MIN_VERSION_CODE,
)

private const val SPECS_APP_MIN_VERSION_CODE = 2046L
private val SPECS_APP_VARIANTS = arrayOf(
    "com.snap.specs.app" to SPECS_APP_MIN_VERSION_CODE,
    "com.snap.specs.app.beta" to SPECS_APP_MIN_VERSION_CODE,
    "com.snap.specs.app.alpha" to SPECS_APP_MIN_VERSION_CODE,
    "com.snap.specs.app.master" to SPECS_APP_MIN_VERSION_CODE,
    "com.snap.specs.app.dev" to SPECS_APP_MIN_VERSION_CODE,
)

internal class SpectaclesKitRequester(
    private val context: Context,
    private val legacy: Boolean
) {

    private val onResult = AtomicReference<Pair<Consumer<Intent>, Consumer<ClientException>>?>()

    fun request(
        request: Intent,
        onSuccess: Consumer<Intent>,
        onFailed: Consumer<ClientException>
    ): Closeable {
        val consumer = onSuccess to onFailed
        onResult.set(consumer)

        val resultObserver = object: ActivityDependencies.ActivityResultObserver {

            override fun onSuccess(intent: Intent?) {
                if (onResult.compareAndSet(consumer, null)) {
                    onSuccess.accept(intent!!)
                }
            }

            override fun onFailure(intent: Intent?) {
                if (onResult.compareAndSet(consumer, null)) {
                    val message = intent?.getStringExtra("message") ?: "User cancelled"
                    onFailed.accept(ClientException(message))
                }
            }
        }

        try {
            ActivityDependencies.install(resultObserver)
            selectPackage { packageName ->
                request.putExtra(SPECTACLES_KIT_EXTRA_PACKAGE, packageName)
                context.startActivity(request)
            }
        } catch (e: Exception) {
            if (onResult.compareAndSet(consumer, null)) {
                if (e is ClientException) {
                    onFailed.accept(e)
                } else {
                    onFailed.accept(ClientException(e.message ?: "", e))
                }
            }
        }

        return Closeable { onResult.set(null) }
    }

    private fun selectPackage(onPackage: (String) -> Unit) {
        val apps = if (!legacy) SPECS_APP_VARIANTS else SPECS_APP_VARIANTS + SPECTACLES_APP_VARIANTS
        apps.map { (variant, minVer) -> variant to checkSpectaclesAppCompatibility(variant, minVer) }
            .minBy { (_, result) -> result }
            .let { (variant, result) ->
                if (result == CompatibilityResult.OK) {
                    onPackage(variant)
                } else {
                    throw result.toClientException()!!
                }
            }
    }

    private fun checkSpectaclesAppCompatibility(packageName: String, minVersion: Long): CompatibilityResult {
        val (packageInfo, appInfo) = try {
            context.packageManager.getPackageInfo(packageName, 0) to
                    context.packageManager.getApplicationInfo(packageName, 0)
        } catch (e: PackageManager.NameNotFoundException) {
            return CompatibilityResult.APP_NOT_INSTALLED
        }

        val isVersionSupported = packageInfo.longVersionCode >= minVersion
        return when {
            !isVersionSupported -> CompatibilityResult.APP_UPDATE_REQUIRED
            !appInfo.enabled -> CompatibilityResult.APP_DISABLED
            else -> CompatibilityResult.OK
        }
    }
}

private enum class CompatibilityResult {

    OK,
    APP_DISABLED,
    APP_UPDATE_REQUIRED,
    APP_NOT_INSTALLED,
    ;

    fun toClientException(): ClientException? = when (this) {
        APP_DISABLED -> ClientException.SpectaclesAppNotEnabled("")
        APP_UPDATE_REQUIRED -> ClientException.SpectaclesAppUpdateRequired("")
        APP_NOT_INSTALLED -> ClientException.SpectaclesAppNotInstalled("")
        else -> null
    }
}
