// Copyright © 2024 Snap, Inc. All rights reserved.

public import Foundation

/// Builder protocol for BondingManager instances
public protocol Builder {
    /// Sets the client identiifer. Required
    @discardableResult
    func setIdentifier(_ identifier: ClientIdentifier) -> Self

    /// Sets the app version. Required
    @discardableResult
    func setVersion(_ version: String) -> Self

    /// Sets the authentication provider. Required
    @discardableResult
    func setAuth(_ auth: any Authentication) -> Self

    /**
     Sets the bluetooth adapter.

     Optional, defaulting to ``BluetoothAdapter/defaultInstance``
     */
    @discardableResult
    func setBluetoothAdaptor(_ bluetoothAdapter: BluetoothAdapter) -> Self

    /**
     Sets the base URL the Specs app will redirect to with bind/unbind responses.

     Optional, defaulting to `specskitapp://specs-mobile-kit/`
     */
    @discardableResult
    func setBondingRedirectURL(_ baseURL: URL) -> Self

    /// Builds the instance. Crashes if any required properties are missing or invalid
    func build() -> any BondingManager
}

public enum BuilderFactory {
    /// Creates an opaque instance of the builder
    public static func create() -> some Builder {
        BuilderImplementation()
    }
}
