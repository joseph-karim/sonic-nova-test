"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelReservationSystem = void 0;
const uuid_1 = require("uuid");
class HotelReservationSystem {
    constructor() {
        this.reservations = new Map();
        this.cities = ["New York", "Los Angeles", "Chicago", "Miami", "Las Vegas"];
        this.roomTypes = {
            "standard": { type: "Standard Room", price: 150, available: true },
            "deluxe": { type: "Deluxe Room", price: 250, available: true },
            "suite": { type: "Suite", price: 400, available: true }
        };
    }
    getReservationsForGuest(guestName) {
        return Array.from(this.reservations.values())
            .filter(res => res.guestName.toLowerCase() === guestName.toLowerCase() && res.status === 'active');
    }
    createReservation(guestName, city, checkIn, checkOut, roomType) {
        if (!this.cities.includes(city)) {
            throw new Error("City not supported");
        }
        if (!this.roomTypes[roomType.toLowerCase()]) {
            throw new Error("Room type not available");
        }
        const reservation = {
            id: (0, uuid_1.v4)(),
            guestName,
            city,
            checkIn,
            checkOut,
            roomType: this.roomTypes[roomType.toLowerCase()].type,
            status: 'active'
        };
        this.reservations.set(reservation.id, reservation);
        return reservation;
    }
    modifyReservation(reservationId, updates) {
        const reservation = this.reservations.get(reservationId);
        if (!reservation || reservation.status !== 'active') {
            return null;
        }
        const updatedReservation = {
            ...reservation,
            ...updates,
            status: 'modified'
        };
        this.reservations.set(reservationId, updatedReservation);
        return updatedReservation;
    }
    cancelReservation(reservationId) {
        const reservation = this.reservations.get(reservationId);
        if (!reservation || reservation.status !== 'active') {
            return false;
        }
        reservation.status = 'cancelled';
        this.reservations.set(reservationId, reservation);
        return true;
    }
    checkAvailability(city, checkIn, checkOut) {
        if (!this.cities.includes(city)) {
            throw new Error("City not supported");
        }
        // In a real system, this would check actual availability
        // For demo purposes, we'll return all room types as available
        return Object.keys(this.roomTypes).reduce((acc, roomType) => {
            acc[this.roomTypes[roomType].type] = true;
            return acc;
        }, {});
    }
    getSupportedCities() {
        return [...this.cities];
    }
    getRoomTypes() {
        return Object.values(this.roomTypes).map(({ type, price }) => ({ type, price }));
    }
}
exports.HotelReservationSystem = HotelReservationSystem;
