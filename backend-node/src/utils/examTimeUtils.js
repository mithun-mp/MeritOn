/**
 * Exam Time Utilities - Phase 25B - Unified IST Time Calculation
 */

function getDateOnlyIST(dateValue) {
  let dateStr;
  if (dateValue instanceof Date) {
    dateStr = dateValue.toISOString().split('T')[0];
  } else if (typeof dateValue === 'string') {
    const d = new Date(dateValue);
    dateStr = d.toISOString().split('T')[0];
  } else {
    throw new Error('Invalid dateValue type');
  }
  return dateStr;
}

function parseExamDateTimeIST(dateValue, timeString) {
  const yyyyMmDd = getDateOnlyIST(dateValue);
  const isoString = `${yyyyMmDd}T${timeString}:00+05:30`;
  return new Date(isoString);
}

function calculateCountdown(targetDate, now = new Date()) {
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

function getExamWindowFromPaper(paperOrTest) {
  let rawDate, rawStartTime, rawExpiryTime;

  if (paperOrTest.meta) {
    rawDate = paperOrTest.meta.date;
    rawStartTime = paperOrTest.meta.startTime;
    rawExpiryTime = paperOrTest.meta.expiryTime;
  } else {
    rawDate = paperOrTest.Date;
    rawStartTime = paperOrTest.StartTime;
    rawExpiryTime = paperOrTest.ExpiryTime || paperOrTest.EndTime;
  }

  const startAt = parseExamDateTimeIST(rawDate, rawStartTime);
  const expiryAt = parseExamDateTimeIST(rawDate, rawExpiryTime);
  const now = new Date();
  const visibleUntil = new Date(expiryAt.getTime() + 24 * 60 * 60 * 1000);

  let status;
  let canLogin;

  if (now < startAt) {
    status = 'Upcoming';
    canLogin = false;
  } else if (now >= startAt && now <= expiryAt) {
    status = 'Active';
    canLogin = true;
  } else {
    status = 'Ended';
    canLogin = false;
  }

  const countdownData = calculateCountdown(startAt, now);

  console.log(`[TIME FIX] TestID: ${paperOrTest.TestID || paperOrTest.id}`);
  console.log(`[TIME FIX] rawDate: ${rawDate}`);
  console.log(`[TIME FIX] rawStartTime: ${rawStartTime}`);
  console.log(`[TIME FIX] rawExpiryTime: ${rawExpiryTime}`);
  console.log(`[TIME FIX] parsedStartAtIST: ${startAt.toISOString()}`);
  console.log(`[TIME FIX] parsedExpiryAtIST: ${expiryAt.toISOString()}`);
  console.log(`[TIME FIX] serverNow: ${now.toISOString()}`);
  console.log(`[TIME FIX] status: ${status}`);
  console.log(`[TIME FIX] canLogin: ${canLogin}`);

  return {
    startAt,
    expiryAt,
    visibleUntil,
    now,
    startAtISO: startAt.toISOString(),
    expiryAtISO: expiryAt.toISOString(),
    visibleUntilISO: visibleUntil.toISOString(),
    serverNowISO: now.toISOString(),
    status,
    canLogin,
    countdownData
  };
}

module.exports = {
  getDateOnlyIST,
  parseExamDateTimeIST,
  calculateCountdown,
  getExamWindowFromPaper
};
