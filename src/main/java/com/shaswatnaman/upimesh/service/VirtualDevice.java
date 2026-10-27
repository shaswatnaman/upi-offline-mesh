package com.shaswatnaman.upimesh.service;

import com.shaswatnaman.upimesh.model.MeshPacket;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ============================================================
 * CONCEPT: OOP — Encapsulation + ConcurrentHashMap
 * ============================================================
 * This class models one phone in the mesh network.
 *
 * ENCAPSULATION: deviceId, hasInternet, and heldPackets are all private.
 *   Outside code cannot directly add/remove packets from heldPackets.
 *   It must use the hold(), holds(), getHeldPackets() methods.
 *   This protects the internal state — the phone controls its own data.
 *
 * CONCURRENTHASHMAP: Multiple threads can call hold() simultaneously
 *   (different packets arriving from multiple neighbours at the same time).
 *   ConcurrentHashMap is thread-safe — no data corruption under concurrency.
 *   putIfAbsent → if packetId already stored, it's silently ignored (dedup).
 *
 * In the real system, this state would be on a physical Android device,
 * with packets exchanged via BLE GATT characteristics.
 * ============================================================
 */
public class VirtualDevice {

    private final String deviceId;      // OOP: instance variable — unique per object
    private final boolean hasInternet;  // OOP: state — different for bridge vs offline phones
    // ConcurrentHashMap: thread-safe, key=packetId, value=the packet
    private final Map<String, MeshPacket> heldPackets = new ConcurrentHashMap<>();

    public VirtualDevice(String deviceId, boolean hasInternet) {
        this.deviceId = deviceId;
        this.hasInternet = hasInternet;
    }

    public String getDeviceId() { return deviceId; }
    public boolean hasInternet() { return hasInternet; }

    // CONCURRENTHASHMAP: putIfAbsent is atomic — if packetId not present, inserts it.
    // If already present (duplicate packet from another neighbour), does nothing.
    // Thread-safe: two threads calling hold() at the same instant won't corrupt the map.
    public void hold(MeshPacket packet) {
        heldPackets.putIfAbsent(packet.getPacketId(), packet);
    }

    public Collection<MeshPacket> getHeldPackets() {
        return heldPackets.values();
    }

    public boolean holds(String packetId) {
        return heldPackets.containsKey(packetId);
    }

    public int packetCount() {
        return heldPackets.size();
    }

    public void clear() {
        heldPackets.clear();
    }
}
