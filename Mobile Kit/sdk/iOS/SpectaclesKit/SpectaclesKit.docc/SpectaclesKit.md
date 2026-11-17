# ``SpectaclesKit``

## Overview

The `SpectaclesKit` framework offers a set of tools and protocols to seamlessly integrate SPECS functionality into your iOS applications. It includes support for device bonding, session management, and asset handling, making it easy to create rich, interactive experiences.

### Key Features

- **Device Bonding**: Easily manage the bonding and unbonding of SPECS devices.
- **Session Management**: Create and manage sessions with SPECS, including handling connection statuses and session requests.
- **Asset Handling**: Work with various asset types such as textures, meshes, audio tracks, and more.
- **Request Handling**: Make and process API requests to interact with SPECS services.

## Topics

### Getting Started

- `BuilderFactory`: The entry point for creating a `Builder`.
- `Builder`: Configures and builds a `BondingManager` instance.
- `ClientIdentifier`: A struct representing a unique client identifier used for authentication.
- `Authentication`: Authentication provider required by `Builder`.

### Device Bonding

- `BondingManager`: The main entry point for bonding and session setup.
- `Bonding`: A protocol representing a bonded SPECS device.
- `BondingRequest`: An enum representing different types of bonding requests.
- `BondingResult`: A typealias for the result of a bonding request.

### Session Management

- `SpectaclesSession`: A protocol defining the methods for managing SPECS sessions.
- `SessionRequest`: A struct representing session configuration options.
- `ConnectionStatus`: An enum representing the connection status of a session.
- `DisconnectReason`: An enum representing the reason for a session disconnect.
- `CloseReason`: An enum representing the reason for closing a session.
- `Metadata`: A struct representing metadata associated with a connected session.

### Asset Handling

- `SpectaclesAssetRequest`: An enum representing different types of asset requests.
- `SpectaclesAssetRequest.Asset`: A struct representing asset content returned to a Lens.
- `SpectaclesLoadAssetRequest`: A protocol for load-asset requests from a Lens.

### Request Handling

- `SpectaclesRequest`: An enum representing top-level SPECS requests.
- `SpectaclesRequestWithResponseProtocol`: A protocol defining a request that expects a single response.
- `SpectaclesRequestWithStreamResponseProtocol`: A protocol defining a request that expects multiple responses.
- `SpectaclesRequestWithoutResponseProtocol`: A protocol defining a request that does not expect a response.
- `SpectaclesApiRequest`: An enum representing different types of API requests.
- `SpectaclesAssetRequest`: An enum representing different types of asset requests.

### Error Handling

- `ClientException`: A class representing client-related exceptions.
- `SessionException`: A class representing session-related exceptions.
- `SpectaclesRequestError`: An enum representing request-related errors.

### Delegates

- `SpectaclesRequestDelegate`: A protocol defining the methods for processing service requests.

## Installation

### Using Swift Package Manager

To integrate `SpectaclesKit` into your Xcode project using Swift Package Manager.

## Usage Examples

### Basic Setup

Here's how to get started with the `SpectaclesKit_iOS` framework:

```swift
import SpectaclesKit

final class SampleAuthentication: Authentication {}

let bondingManager = BuilderFactory.create()
    .setIdentifier(ClientIdentifier(clientId: "exampleID", appName: "SampleApp")!)
    .setVersion("1.0")
    .setAuth(SampleAuthentication())
    .build()
```
