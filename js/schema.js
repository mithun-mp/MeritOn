/**
 * MeritOn Enterprise Schema Engine (v3.0)
 * Centralized source of truth for all field names and data normalization.
 */

const SCHEMA = {
    // Primary Identity Fields
    USER_ID: 'userID',
    NAME: 'name',
    EMAIL: 'Email',
    TEST_ID: 'TestId',

    // Performance & Scoring
    PERFORMANCE: {
        TOTAL_SCORE: 'TotalScore',
        NET_SCORE: 'NetScore',
        TOTAL_QUESTIONS: 'TotalQuestions',
        CORRECT_COUNT: 'CorrectCount',
        WRONG_COUNT: 'WrongCount',
        UNANSWERED_COUNT: 'UnansweredCount',
        SECTION_ANALYTICS: 'SectionAnalyticsJSON',
        RANK: 'Rank',
        PERCENTILE: 'Percentile',
        OVERALL_PERCENTAGE: 'OverallPercentage',
        AVERAGE_SECTION_PERCENTAGE: 'AverageSectionPercentage'
    },

    // Security & Timing
    SECURITY: {
        FULLSCREEN_VIOLATIONS: 'FullScreenViolations',
        TAB_SWITCH_COUNT: 'TabSwitchCount',
        STARTED_AT: 'StartedAt',
        SUBMITTED_AT: 'SubmittedAt',
        TOTAL_TIME_TAKEN: 'TotalTimeTaken',
        AUTO_SUBMITTED: 'AutoSubmitted'
    },

    // States
    STATE: 'State'
};

/**
 * Normalizes any incoming or outgoing payload to the strict enterprise schema.
 * Prevents duplicate variants like 'UserID', 'UserID', 'userId' etc.
 * FORMAT PRESERVATION: Skips trimming for 'question' and options.
 */
function normalizePayload(data) {
    if (!data || typeof data !== 'object') return data;

    const normalized = {
        userID: (data.userID || data.UserID || data.userId || '').toString().trim(),
        name: (data.name || data.Name || '').toString().trim(),
        Email: (data.Email || data.email || '').toString().trim(),
        UnivID: (data.UnivID || data.univId || data.univid || '').toString().trim(),
        TestId: (data.TestId || data.TestID || data.testId || '').toString().trim(),
        sessionToken: (data.sessionToken || data.token || '').toString().trim()
    };

    // IDENTITY & METADATA
    if (data.QID !== undefined || data.qid !== undefined) normalized.QID = data.QID ?? data.qid;
    if (data.Section !== undefined || data.section !== undefined) normalized.Section = data.Section ?? data.section;
    if (data.Difficulty !== undefined || data.difficulty !== undefined) normalized.Difficulty = data.Difficulty ?? data.difficulty;
    if (data.identifier !== undefined || data.Identifier !== undefined) normalized.identifier = data.identifier ?? data.Identifier;

    // FORMAT PRESERVATION: Ensure question body and options are NOT trimmed
    if (data.Question !== undefined || data.question !== undefined) normalized.Question = String(data.Question ?? data.question);
    if (data.A !== undefined || data.a !== undefined) normalized.A = String(data.A ?? data.a);
    if (data.B !== undefined || data.b !== undefined) normalized.B = String(data.B ?? data.b);
    if (data.C !== undefined || data.c !== undefined) normalized.C = String(data.C ?? data.c);
    if (data.D !== undefined || data.d !== undefined) normalized.D = String(data.D ?? data.d);
    if (data.Correct !== undefined || data.correct !== undefined) normalized.Correct = String(data.Correct ?? data.correct);

    // PERFORMANCE & SCORING
    if (data.NetScore !== undefined || data.netScore !== undefined) normalized.NetScore = data.NetScore ?? data.netScore;
    if (data.TotalScore !== undefined || data.totalScore !== undefined) normalized.TotalScore = data.TotalScore ?? data.totalScore;
    if (data.SectionAnalyticsJSON !== undefined || data.sectionAnalyticsJSON !== undefined) {
        normalized.SectionAnalyticsJSON = data.SectionAnalyticsJSON ?? data.sectionAnalyticsJSON;
    }
    if (data.CorrectCount !== undefined || data.correctCount !== undefined) normalized.CorrectCount = data.CorrectCount ?? data.correctCount;
    if (data.WrongCount !== undefined || data.wrongCount !== undefined) normalized.WrongCount = data.WrongCount ?? data.wrongCount;
    if (data.UnansweredCount !== undefined || data.unansweredCount !== undefined) normalized.UnansweredCount = data.UnansweredCount ?? data.unansweredCount;
    if (data.TotalQuestions !== undefined || data.totalQuestions !== undefined) normalized.TotalQuestions = data.TotalQuestions ?? data.totalQuestions;
    if (data.Rank !== undefined || data.rank !== undefined) normalized.Rank = data.Rank ?? data.rank;
    if (data.Percentile !== undefined || data.percentile !== undefined) normalized.Percentile = data.Percentile ?? data.percentile;
    if (data.OverallPercentage !== undefined || data.overallPercentage !== undefined) {
        normalized.OverallPercentage = data.OverallPercentage ?? data.overallPercentage;
    }
    if (data.AverageSectionPercentage !== undefined || data.averageSectionPercentage !== undefined) {
        normalized.AverageSectionPercentage = data.AverageSectionPercentage ?? data.averageSectionPercentage;
    }
    
    // RESPONSE SPECIFIC
    if (data.IsCorrect !== undefined || data.isCorrect !== undefined) normalized.IsCorrect = data.IsCorrect ?? data.isCorrect;
    if (data.IsUnanswered !== undefined || data.isUnanswered !== undefined) normalized.IsUnanswered = data.IsUnanswered ?? data.isUnanswered;
    if (data.SelectedAnswer !== undefined || data.selectedAnswer !== undefined) normalized.SelectedAnswer = data.SelectedAnswer ?? data.selectedAnswer;
    if (data.CorrectAnswer !== undefined || data.correctAnswer !== undefined) normalized.CorrectAnswer = data.CorrectAnswer ?? data.correctAnswer;

    // SECURITY & TIMING
    if (data.FullScreenViolations !== undefined || data.fullscreenViolations !== undefined) normalized.FullScreenViolations = data.FullScreenViolations ?? data.fullscreenViolations;
    if (data.TabSwitchCount !== undefined || data.tabSwitchCount !== undefined) normalized.TabSwitchCount = data.TabSwitchCount ?? data.tabSwitchCount;
    if (data.StartedAt !== undefined || data.startedAt !== undefined) {
        normalized.StartedAt = data.StartedAt ?? data.startedAt;
        normalized.startedAt = normalized.StartedAt;
    }
    if (data.SubmittedAt !== undefined || data.submittedAt !== undefined) {
        normalized.SubmittedAt = data.SubmittedAt ?? data.submittedAt;
        normalized.submittedAt = normalized.SubmittedAt;
    }
    if (data.TotalTimeTaken !== undefined || data.totalTimeTaken !== undefined) normalized.TotalTimeTaken = data.TotalTimeTaken ?? data.totalTimeTaken;

    // Clone data and merge normalized fields, then remove duplicates
    const final = { ...data, ...normalized };
    
    const duplicates = [
        'UserID', 'userId', 'Name', 'email', 'univId', 'univid', 'TestID', 'testId', 
        'Identifier', 'token',
        'qid', 'section', 'difficulty', 'question', 'correct',
        'netScore', 'totalScore', 'sectionAnalyticsJSON', 'correctCount', 'wrongCount', 'unansweredCount', 'totalQuestions',
        'rank', 'percentile', 'overallPercentage', 'averageSectionPercentage',
        'isCorrect', 'isUnanswered', 'selectedAnswer', 'correctAnswer',
        'fullscreenViolations', 'tabSwitchCount', 'startedAt', 'submittedAt', 'totalTimeTaken'
    ];
    duplicates.forEach(key => delete final[key]);

    return final;
}

/**
 * Safely parses SectionAnalyticsJSON with error handling and defaults.
 */
function parseSectionAnalytics(json) {
    if (json) {
        try {
            const parsed = typeof json === 'string' ? JSON.parse(json) : json;
            return enrichSectionAnalytics(parsed);
        } catch (e) {
            debugLog('ERROR', 'SCHEMA', 'Failed to parse SectionAnalyticsJSON');
            return {};
        }
    }
    return {};
}

/** Academic section % = (correct / total) * 100 */
function calcAccuracyPercentage(correct, total) {
    const t = Number(total) || 0;
    const c = Number(correct) || 0;
    if (t <= 0) return 0;
    return Math.round((c / t) * 10000) / 100;
}

/** Ensure each section has percentage from correct/total (not marks). */
function enrichSectionAnalytics(sections) {
    if (!sections || typeof sections !== 'object') return {};
    const out = { ...sections };
    Object.keys(out).forEach(name => {
        const s = out[name] || {};
        const total = Number(s.total) || 0;
        const correct = Number(s.correct) || 0;
        out[name] = {
            ...s,
            total,
            correct,
            wrong: Number(s.wrong) || 0,
            unanswered: Number(s.unanswered) || 0,
            percentage: s.percentage != null && s.percentage !== ''
                ? Number(s.percentage)
                : calcAccuracyPercentage(correct, total)
        };
    });
    return out;
}

/** Overall % from performance record (correct/total only). */
function getOverallPercentage(record) {
    if (!record) return 0;
    if (record.OverallPercentage != null && record.OverallPercentage !== '') {
        return Number(record.OverallPercentage);
    }
    return calcAccuracyPercentage(record.CorrectCount, record.TotalQuestions);
}

function getAverageSectionPercentage(record) {
    if (!record) return 0;
    if (record.AverageSectionPercentage != null && record.AverageSectionPercentage !== '') {
        return Number(record.AverageSectionPercentage);
    }
    const sections = parseSectionAnalytics(record.SectionAnalyticsJSON);
    const keys = Object.keys(sections);
    if (keys.length === 0) return 0;
    const sum = keys.reduce((acc, k) => acc + (sections[k].percentage || 0), 0);
    return Math.round((sum / keys.length) * 100) / 100;
}

function getSectionPercentage(sectionData) {
    if (!sectionData) return 0;
    if (sectionData.percentage != null && sectionData.percentage !== '') {
        return Number(sectionData.percentage);
    }
    return calcAccuracyPercentage(sectionData.correct, sectionData.total);
}

function validateRecord(record, sheetName) {
    const required = {
        'Tests': ['TestID', 'Name', 'Date', 'StartTime'],
        'Questions': ['TestID', 'QID', 'Question', 'Correct']
    };

    const missing = (required[sheetName] || []).filter(field => !record[field]);
    if (missing.length > 0) {
        debugLog('WARN', 'SCHEMA', 'Validation Warning: Missing fields');
    }
    return missing.length === 0;
}

/**
 * Build a normalized user directory for admin search (email, UnivID, name, userID).
 */
function buildUserDirectory(users) {
    return (users || []).map(u => ({
        userID: String(u.UserID || u.userID || u.userId || '').trim(),
        email: String(u.Email || u.email || '').toLowerCase().trim(),
        univId: String(u.UnivID || u.univId || u.univid || '').toLowerCase().trim(),
        name: String(u.FullName || u.fullName || u.name || u.Name || '').toLowerCase().trim(),
        label: String(u.FullName || u.fullName || u.name || u.Name || 'Candidate').trim()
    })).filter(u => u.userID);
}

/**
 * Find candidates matching a search query (email, UnivID, name, or internal userID).
 */
function findCandidateMatches(query, users, performanceRecords = []) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];

    const seen = new Set();
    const matches = [];

    const add = (userID, label, source) => {
        const id = String(userID || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        matches.push({ userID: id, label: label || id, source });
    };

    buildUserDirectory(users).forEach(u => {
        if (
            u.userID.toLowerCase() === q ||
            u.email === q ||
            u.univId === q ||
            u.name.includes(q) ||
            u.email.includes(q) ||
            u.univId.includes(q) ||
            u.userID.toLowerCase().includes(q)
        ) {
            add(u.userID, `${u.label} (${u.univId || u.email || u.userID})`, 'users');
        }
    });

    (performanceRecords || []).forEach(p => {
        const uid = String(p.userID || p.UserID || '').trim();
        const name = String(p.name || p.Name || '').toLowerCase();
        const email = String(p.Email || p.email || '').toLowerCase();
        if (
            uid.toLowerCase() === q ||
            uid.toLowerCase().includes(q) ||
            name.includes(q) ||
            email.includes(q)
        ) {
            add(uid, p.name || p.Name || uid, 'performance');
        }
    });

    return matches;
}

/**
 * Resolve a single userID from search text; null if none, throws via return { ambiguous }.
 */
function resolveCandidateUserId(query, users, performanceRecords = []) {
    const matches = findCandidateMatches(query, users, performanceRecords);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].userID;

    const q = String(query || '').toLowerCase().trim();
    const directory = buildUserDirectory(users);
    const exact = directory.find(u => u.email === q || u.univId === q || u.userID.toLowerCase() === q);
    if (exact) return exact.userID;

    return { ambiguous: true, matches };
}

function enrichRecordsWithUnivId(records, users) {
    const map = {};
    buildUserDirectory(users).forEach(u => {
        map[u.userID] = u.univId;
    });
    return (records || []).map(r => {
        const uid = String(r.userID || r.UserID || '').trim();
        const univ = map[uid] || r.UnivID || r.univId || '';
        return { ...r, userID: uid || r.userID, univId: univ, UnivID: univ };
    });
}

function recordMatchesCandidateSearch(record, search) {
    const s = String(search || '').toLowerCase().trim();
    if (!s) return true;
    return (
        String(record.name || record.Name || '').toLowerCase().includes(s) ||
        String(record.userID || record.UserID || '').toLowerCase().includes(s) ||
        String(record.Email || record.email || '').toLowerCase().includes(s) ||
        String(record.univId || record.UnivID || record.univid || '').toLowerCase().includes(s)
    );
}

window.SCHEMA = SCHEMA;
window.normalizePayload = normalizePayload;
window.parseSectionAnalytics = parseSectionAnalytics;
window.enrichSectionAnalytics = enrichSectionAnalytics;
window.calcAccuracyPercentage = calcAccuracyPercentage;
window.getOverallPercentage = getOverallPercentage;
window.getAverageSectionPercentage = getAverageSectionPercentage;
window.getSectionPercentage = getSectionPercentage;
window.validateRecord = validateRecord;
window.buildUserDirectory = buildUserDirectory;
window.findCandidateMatches = findCandidateMatches;
window.resolveCandidateUserId = resolveCandidateUserId;
window.enrichRecordsWithUnivId = enrichRecordsWithUnivId;
window.recordMatchesCandidateSearch = recordMatchesCandidateSearch;
