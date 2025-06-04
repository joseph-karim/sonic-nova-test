"use strict";
// Copied from example amazon-nova-samples/.../resume-conversation/src/hotel-confirmation.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleToolCall = exports.cancelReservation = exports.getReservation = void 0;
// Mock database
const mockReservations = [
    {
        reservationId: "RES-12345",
        name: "Angela Park",
        checkInDate: "2025-04-12",
        checkOutDate: "2025-04-15",
        hotelName: "Seaview Hotel",
        roomType: "Deluxe Ocean View",
        totalCost: 750.00,
        isPaid: true,
        createdAt: "2024-12-15",
    },
    {
        reservationId: "RES-23456",
        name: "Don Smith",
        checkInDate: "2025-05-15",
        checkOutDate: "2025-05-20",
        hotelName: "Mountain Lodge",
        roomType: "Standard King",
        totalCost: 850.00,
        isPaid: true,
        createdAt: "2024-11-30",
    },
    {
        reservationId: "RES-34567",
        name: "Maria Rodriguez",
        checkInDate: "2025-06-10",
        checkOutDate: "2025-06-14",
        hotelName: "City Central Hotel",
        roomType: "Executive Suite",
        totalCost: 1200.00,
        isPaid: true,
        createdAt: "2024-12-05",
    }
];
const mockCancellationPolicies = {
    "RES-12345": {
        reservationId: "RES-12345",
        freeCancellationUntil: "2025-04-05", // 7 days before check-in
        partialRefundUntil: "2025-04-10", // 2 days before check-in
        partialRefundPercentage: 50,
        noRefundAfter: "2025-04-10",
        additionalNotes: null,
    },
    "RES-23456": {
        reservationId: "RES-23456",
        freeCancellationUntil: "2025-05-10", // 5 days before check-in
        partialRefundUntil: "2025-05-14", // 1 day before check-in
        partialRefundPercentage: 30,
        noRefundAfter: "2025-01-14", // Typo in example? Should likely be 2025-05-14
        additionalNotes: "Non-refundable deposit of $100 applies to all cancellations",
    },
    "RES-34567": {
        reservationId: "RES-34567",
        freeCancellationUntil: null, // No free cancellation
        partialRefundUntil: "2025-06-03", // 7 days before check-in
        partialRefundPercentage: 25,
        noRefundAfter: "2025-06-03",
        additionalNotes: "Special event rate with limited cancellation options",
    }
};
// Helper to get today's date in YYYY-MM-DD format
const getTodayDate = () => {
    // Using system's current date, which might be 2025 in this context
    return new Date().toISOString().split('T')[0];
};
// Tool implementation functions
const getReservation = async (params) => {
    console.log(`[Tool] Looking up reservation for ${params.name} with check-in date ${params.checkInDate}`);
    const reservation = mockReservations.find(r => r.name.toLowerCase() === params.name.toLowerCase() &&
        r.checkInDate === params.checkInDate);
    if (!reservation) {
        console.log("[Tool] Reservation not found.");
        return null;
    }
    console.log(`[Tool] Found reservation: ${reservation.reservationId}`);
    const cancellationPolicy = reservation.reservationId ? mockCancellationPolicies[reservation.reservationId] : null;
    // Add cancellation policy to the reservation (doesn't modify original mock data)
    const reservationWithPolicy = {
        ...reservation,
        cancellationPolicy
    };
    return reservationWithPolicy;
};
exports.getReservation = getReservation;
const cancelReservation = async (params) => {
    console.log(`[Tool] Processing cancellation for reservation ${params.reservationId}`);
    if (!params.confirmCancellation) {
        console.log("[Tool] Cancellation not confirmed by customer.");
        return {
            success: false,
            reservationId: params.reservationId,
            cancellationDate: getTodayDate(),
            refundAmount: 0,
            refundPercentage: 0,
            confirmationCode: "",
            message: "Cancellation not confirmed. Please confirm if you wish to cancel."
        };
    }
    const reservation = mockReservations.find(r => r.reservationId === params.reservationId);
    if (!reservation) {
        console.log("[Tool] Reservation not found for cancellation.");
        return {
            success: false,
            reservationId: params.reservationId,
            cancellationDate: getTodayDate(),
            refundAmount: 0,
            refundPercentage: 0,
            confirmationCode: "",
            message: "Reservation ID not found."
        };
    }
    const policy = mockCancellationPolicies[params.reservationId];
    if (!policy) {
        console.log(`[Tool] Cancellation policy not found for reservation ${params.reservationId}.`);
        return {
            success: false,
            reservationId: params.reservationId,
            cancellationDate: getTodayDate(),
            refundAmount: 0,
            refundPercentage: 0,
            confirmationCode: "",
            message: "Cancellation policy not found for this reservation."
        };
    }
    const today = getTodayDate();
    let refundPercentage = 0;
    let refundAmount = 0;
    let message = "";
    // Calculate refund
    if (policy.freeCancellationUntil && today <= policy.freeCancellationUntil) {
        refundPercentage = 100;
        refundAmount = reservation.totalCost;
        message = "Full refund will be processed.";
    }
    else if (policy.partialRefundUntil && today <= policy.partialRefundUntil) {
        refundPercentage = policy.partialRefundPercentage;
        refundAmount = reservation.totalCost * (refundPercentage / 100);
        message = `Partial refund of ${refundPercentage}% (${refundAmount.toFixed(2)}) will be processed.`;
    }
    else {
        refundPercentage = 0;
        refundAmount = 0;
        message = "No refund is applicable based on the cancellation date and policy.";
    }
    if (policy.additionalNotes) {
        message += ` ${policy.additionalNotes}.`;
    }
    const confirmationCode = `CNX-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    console.log(`[Tool] Cancellation successful for ${params.reservationId}. Refund: ${refundAmount.toFixed(2)} (${refundPercentage}%). Code: ${confirmationCode}`);
    // In a real scenario, you would update the reservation status in the database here.
    return {
        success: true,
        reservationId: params.reservationId,
        cancellationDate: today,
        refundAmount,
        refundPercentage,
        confirmationCode,
        message: `Cancellation successful. Confirmation code: ${confirmationCode}. ${message}`
    };
};
exports.cancelReservation = cancelReservation;
// Central handler called by BedrockSessionManager
const handleToolCall = async (toolUse) => {
    console.log(`[Tool Handler] Received tool call request: ${JSON.stringify(toolUse)}`);
    const toolName = toolUse?.toolName;
    let toolInput;
    // Try parsing the input content
    try {
        if (typeof toolUse?.content === 'string') {
            toolInput = JSON.parse(toolUse.content);
            console.log(`[Tool Handler] Parsed input: ${JSON.stringify(toolInput)}`);
        }
        else if (typeof toolUse?.content === 'object') {
            // Sometimes it might already be parsed if coming from specific event structures
            toolInput = toolUse.content;
        }
        else {
            throw new Error("Tool input content is missing or not a string/object");
        }
    }
    catch (parseError) {
        console.error(`[Tool Handler] Error parsing tool input content: ${toolUse?.content}`, parseError);
        return { status: "error", message: "Invalid input format for tool." };
    }
    // Process based on tool name
    let result;
    try {
        switch (toolName) {
            case 'getReservationTool':
                result = await (0, exports.getReservation)(toolInput);
                break;
            case 'cancelReservationTool':
                result = await (0, exports.cancelReservation)(toolInput);
                break;
            default:
                console.error(`[Tool Handler] Unknown tool name: ${toolName}`);
                return { status: "error", message: `Tool ${toolName} not supported.` };
        }
        console.log(`[Tool Handler] Tool call successful. Result: ${JSON.stringify(result)}`);
        // Format for Bedrock response
        return { result: result ?? { message: "No matching reservation found." }, status: "success" };
    }
    catch (error) {
        console.error(`[Tool Handler] Error executing tool ${toolName}:`, error);
        return { status: "error", message: `Error executing tool: ${error.message}` };
    }
};
exports.handleToolCall = handleToolCall;
