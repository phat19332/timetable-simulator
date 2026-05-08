const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const normalizeText = (value = '') =>
    value
        .replace(/\r/g, '\n')
        .replace(/[\t\u00a0]+/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');

/**
 * Merges lines that start with '|' (English name continuation) into the
 * previous line, but keeps individual schedule sub-lines separate so we
 * can detect multi-session groups later.
 */
const mergeContinuationLines = (value = '') => {
    const lines = value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const merged = [];

    for (const line of lines) {
        if (line.startsWith('|') && merged.length) {
            merged[merged.length - 1] += ` ${line}`;
            continue;
        }
        merged.push(line);
    }

    return merged;
};

const parsePositions = (value = '') => {
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
        if (value[index] !== '-') {
            result.push(index + 1);
        }
    }
    return [...new Set(result)];
};

const parseDay = (value = '') => {
    const match = value.match(/([2-7])/);
    if (!match) return null;
    return Number(match[1]);
};

/**
 * Tries to parse a full record line (with course code, name, credits, group,
 * and the first schedule segment).
 * Returns { meta, session } or null.
 */
const parseFullLine = (line) => {
    const compact = line.replace(/\s+/g, ' ').trim();
    if (!/^[A-Z]?\d{5,6}\s/.test(compact)) return null;

    const match = compact.match(
        /^([A-Z]?\d{5,6})\s+(.+?)\s+\|\s+(.+?)\s+(\d+)\s+([0-9]{2,3}(?::\d+)?)\s+(.+?)\s*,\s*Thứ\s*([2-7])\s*,\s*Phòng\s*(.*?)\s*,\s*(.+)$/i,
    );

    if (!match) return null;

    const [, code, viName, enName, credits, group, periodsRaw, dayRaw, roomRaw, weeksRaw] = match;
    const periods = parsePositions(periodsRaw);
    const weeks = parsePositions(weeksRaw);
    const day = parseDay(dayRaw);
    const isPractice = group.includes(':');
    const baseGroup = isPractice ? group.split(':')[0] : group;

    return {
        meta: { code, viName, enName, credits: Number(credits), group, baseGroup, isPractice },
        session: {
            day,
            dayLabel: day ? DAY_LABELS[day - 2] : 'N/A',
            periods,
            periodLabel: periods.length ? periods.join(', ') : 'N/A',
            room: roomRaw.trim() || '---',
            weeks,
            weeksLabel: weeks.length ? weeks.join(', ') : 'N/A',
            periodsRaw,
        },
    };
};

/**
 * Tries to parse a "continuation schedule" line that has no course header —
 * only a period string, day, room, and weeks.
 * Format: <periodStr>, Thứ <N>, Phòng <room>, <weekStr>
 */
const parseContinuationSchedule = (line) => {
    const compact = line.replace(/\s+/g, ' ').trim();
    // Must NOT start like a course code line
    if (/^[A-Z]?\d{5,6}\s/.test(compact)) return null;

    const match = compact.match(
        /^([0-9\-]+)\s*,\s*Thứ\s*([2-7])\s*,\s*Phòng\s*(.*?)\s*,\s*(.+)$/i,
    );

    if (!match) return null;

    const [, periodsRaw, dayRaw, roomRaw, weeksRaw] = match;
    const periods = parsePositions(periodsRaw);
    const weeks = parsePositions(weeksRaw);
    const day = parseDay(dayRaw);

    return {
        day,
        dayLabel: day ? DAY_LABELS[day - 2] : 'N/A',
        periods,
        periodLabel: periods.length ? periods.join(', ') : 'N/A',
        room: roomRaw.trim() || '---',
        weeks,
        weeksLabel: weeks.length ? weeks.join(', ') : 'N/A',
        periodsRaw,
    };
};

/**
 * Build a stable record id from code, group, and all sessions.
 */
const buildId = (code, group, sessions) => {
    const sessionKey = sessions.map((s) => `${s.day ?? 'x'}-${s.periodsRaw}`).join('|');
    return `${code}-${group}-${sessionKey}`;
};

export const parseTimetableInput = (rawText) => {
    const normalized = normalizeText(rawText);
    if (!normalized) return [];

    const mergedLines = mergeContinuationLines(normalized);

    const records = [];
    let pending = null; // { meta, sessions[] }

    const flushPending = () => {
        if (!pending) return;
        const { meta, sessions } = pending;
        records.push({
            id: buildId(meta.code, meta.group, sessions),
            code: meta.code,
            courseName: meta.viName.trim(),
            englishName: meta.enName.trim(),
            credits: meta.credits,
            group: meta.group,
            baseGroup: meta.baseGroup,
            isPractice: meta.isPractice,
            sessions, // array of session objects
            // Convenience alias kept for simple single-session logic
            schedule: sessions[0],
        });
        pending = null;
    };

    for (const line of mergedLines) {
        const full = parseFullLine(line);
        if (full) {
            flushPending();
            pending = { meta: full.meta, sessions: [full.session] };
            continue;
        }

        // Try to attach as an extra session to the current pending record
        if (pending) {
            const extra = parseContinuationSchedule(line);
            if (extra) {
                pending.sessions.push(extra);
                continue;
            }
        }

        // Not a recognisable line — flush and ignore
        flushPending();
    }

    flushPending();

    // Deduplicate by id
    const deduped = new Map();
    for (const record of records) {
        deduped.set(record.id, record);
    }

    return [...deduped.values()];
};

export const groupByCourse = (records) => {
    const grouped = new Map();

    for (const record of records) {
        if (!grouped.has(record.code)) {
            grouped.set(record.code, {
                code: record.code,
                courseName: record.courseName,
                englishName: record.englishName,
                credits: record.credits,
                theoryGroups: [],
                practiceGroups: [],
            });
        }

        const target = grouped.get(record.code);
        if (record.isPractice) {
            if (!target.practiceGroups.some((g) => g.id === record.id)) {
                target.practiceGroups.push(record);
            }
        } else {
            if (!target.theoryGroups.some((g) => g.id === record.id)) {
                target.theoryGroups.push(record);
            }
        }
    }

    return [...grouped.values()];
};

/**
 * Build a slot map that covers ALL sessions of every selected group.
 */
export const buildSelectedSlots = (selectedGroups) => {
    const slots = new Map();

    selectedGroups.forEach((group) => {
        (group.sessions || [group.schedule]).forEach((session) => {
            session.periods.forEach((period) => {
                const key = `${session.day}-${period}`;
                if (!slots.has(key)) slots.set(key, []);
                // Store the group reference but annotate with the session it came from
                slots.get(key).push({ ...group, schedule: session });
            });
        });
    });

    return slots;
};

/**
 * Returns true if candidate conflicts with any group in selectedGroups
 * (checks ALL sessions of both).
 */
export const hasConflict = (candidate, selectedGroups) => {
    const candidateSessions = candidate.sessions || [candidate.schedule];
    return selectedGroups.some((group) => {
        const groupSessions = group.sessions || [group.schedule];
        return candidateSessions.some((cs) =>
            groupSessions.some(
                (gs) =>
                    gs.day === cs.day &&
                    gs.periods.some((p) => cs.periods.includes(p)),
            ),
        );
    });
};

export const getConflictLabels = (candidate, selectedGroups) => {
    const candidateSessions = candidate.sessions || [candidate.schedule];
    return selectedGroups
        .filter((group) => {
            const groupSessions = group.sessions || [group.schedule];
            return candidateSessions.some((cs) =>
                groupSessions.some(
                    (gs) =>
                        gs.day === cs.day &&
                        gs.periods.some((p) => cs.periods.includes(p)),
                ),
            );
        })
        .map((group) => `${group.code} - ${group.group}`);
};

export const DAY_ORDER = [2, 3, 4, 5, 6, 7, 8];
export const PERIODS = Array.from({ length: 12 }, (_, index) => index + 1);
