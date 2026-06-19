/**
 * Exam Time Utilities - Phase 25
 */

/**
 * Parses exam date and time as Asia/Kolkata (IST)
 * @param {string|Date} dateValue - Date as string or Date object
 * @param {string} timeString - Time in "HH:mm" format
 * @returns {Date} Date object representing IST time
 */
function parseExamDateTimeIST(dateValue, timeString) {
    let dateStr;
    if (dateValue instanceof Date) {
        dateStr = dateValue.toISOString().split('T')[0];
    } else if (typeof dateValue === 'string') {
        const parsed = new Date(dateValue);
        dateStr = parsed.toISOString().split('T')[0];
    } else {
        throw new Error('Invalid dateValue type');
    }
    const isoStr = `${dateStr}T${timeString}:00+05:30`;
    return new Date(isoStr);
}

/**
 * Gets exam window information
 * @param {Object} testOrPaper - Test or TestPaper object
 * @returns {Object} Exam window details
 */
function getExamWindow(testOrPaper) {
    let date, startTime, expiryTime;

    if (testOrPaper.meta) {
        date = testOrPaper.meta.date;
        startTime = testOrPaper.meta.startTime;
        expiryTime = testOrPaper.meta.expiryTime;
    } else {
        date = testOrPaper.Date;
        startTime = testOrPaper.StartTime;
        expiryTime = testOrPaper.ExpiryTime || testOrPaper.EndTime;
    }

    const startAt = parseExamDateTimeIST(date, startTime);
    const expiryAt = parseExamDateTimeIST(date, expiryTime);
    const now = new Date();
    const visibleUntil = new Date(expiryAt.getTime() + 24 * 60 * 60 * 1000);

    const isUpcoming = now < startAt;
    const isActive = now >= startAt && now <= expiryAt;
    const isEnded = now > expiryAt;

    console.log(`[TIME] TestID: ${testOrPaper.TestID}`);
    console.log(`[TIME] Raw date: ${date}, start: ${startTime}, expiry: ${expiryTime}`);
    console.log(`[TIME] Parsed startAt: ${startAt.toISOString()}`);
    console.log(`[TIME] Parsed expiryAt: ${expiryAt.toISOString()}`);
    console.log(`[TIME] Now: ${now.toISOString()}`);
    console.log(`[TIME] Status: ${isActive ? 'Active' : (isUpcoming ? 'Upcoming' : 'Ended'))}`);

    return {
        startAt,
        expiryAt,
        visibleUntil,
        now,
        isUpcoming,
        isActive,
        isEnded
    };
}

/**
 * Calculates countdown from now to target date
 * @param {Date} targetDate 
 * @returns {Object} Countdown details
 */
function calculateCountdown(targetDate) {
    const now = new Date();
    const totalMs = Math.max(0, targetDate.getTime() - now.getTime());
    const seconds = Math.floor((totalMs / 1000) % 60);
    const minutes = Math.floor((totalMs / (1000 * 60)) % 60);
    const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));

    return {
        totalMs,
        days,
        hours,
        minutes,
        seconds,
        isExpired: totalMs <= 0
    };
}

module.exports = {
    parseExamDateTimeIST,
    getExamWindow,
    calculateCountdown
};
