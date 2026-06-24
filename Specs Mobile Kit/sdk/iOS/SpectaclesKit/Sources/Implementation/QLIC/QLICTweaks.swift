// Copyright © 2025 Snap, Inc. All rights reserved.

import Foundation

/**
 Whether the QLIC peer fully implements ack frames at every encryption level or has the firmware bug where pings are needed.

 Mirrors the enum in specs-mobile-app's `Tweaks.swift` so that `QLICRunLoop.swift` stays source-identical between the two repos.
 */
enum PeerAckBehavior: String, CaseIterable, Sendable {
    /// Peer only acks ping-bearing packets, AND mishandles pings/acks at handshake encryption levels.
    case pingsOnlyHandshakeBroken = "Pings only, handshake broken"
    /// Peer only acks ping-bearing packets, but handles pings/acks correctly during the handshake.
    case pingsOnly = "Pings only"
    /// Peer acks every ack-soliciting packet, regardless of whether it contains a ping.
    case fullySpecCompliant = "Fully spec-compliant"
}

/**
 Shim that provides the minimum QLICTweaks surface area used by mobile-kit/QLIC.

 Why: specs-mobile-app has a full runtime tweak system (CMBTweaks) used for connectivity debugging. The kit does not ship a tweak system to end users, so this shim hardcodes each value to its production default. It exists only so that `QLICRunLoop.swift` can stay source-identical to the specs-mobile-app version, which makes future cherry-picks of QLIC fixes between the two repos trivial.
 */
final class QLICTweaks: Sendable {
    static let sharedInstance = QLICTweaks()

    let peerAckBehavior = TweakValue(PeerAckBehavior.pingsOnlyHandshakeBroken)
}

/// Minimal stand-in for `CMBTweaks.TweakValue` — exposes only the `currentValue` getter that the QLIC layer reads.
struct TweakValue<T: Sendable>: Sendable {
    let currentValue: T

    init(_ defaultValue: T) {
        self.currentValue = defaultValue
    }
}
