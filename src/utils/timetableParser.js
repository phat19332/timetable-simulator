const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const normalizeText = (value = '') =>
    value
        .replace(/\r/g, '\n')
        .replace(/[\t\u00a0]+/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');

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

    const dayNumber = Number(match[1]);
    return dayNumber;
};

const parseRecord = (line) => {
    const compact = line.replace(/\s+/g, ' ').trim();
    if (!/^[A-Z]?\d{5,6}\s/.test(compact)) return null;

    const match = compact.match(
        /^([A-Z]?\d{5,6})\s+(.+?)\s+\|\s+(.+?)\s+(\d+)\s+([0-9]{2}(?::\d+)?)\s+(.+?)\s*,\s*Thứ\s*([2-7])\s*,\s*Phòng\s*(.*?)\s*,\s*(.+)$/i,
    );

    if (!match) return null;

    const [, code, viName, enName, credits, group, periodsRaw, dayRaw, roomRaw, weeksRaw] = match;
    const periods = parsePositions(periodsRaw);
    const weeks = parsePositions(weeksRaw);
    const day = parseDay(dayRaw);
    const isPractice = group.includes(':');
    const baseGroup = isPractice ? group.split(':')[0] : group;

    return {
        id: `${code}-${group}-${day ?? 'x'}-${periodsRaw}`,
        code,
        courseName: viName.trim(),
        englishName: enName.trim(),
        credits: Number(credits),
        group,
        baseGroup,
        isPractice,
        schedule: {
            day,
            dayLabel: day ? DAY_LABELS[day - 2] : 'N/A',
            periods,
            periodLabel: periods.length ? periods.join(', ') : 'N/A',
            room: roomRaw.trim() || '---',
            weeks,
            weeksLabel: weeks.length ? weeks.join(', ') : 'N/A',
        },
    };
};

export const parseTimetableInput = (rawText) => {
    const normalized = normalizeText(rawText);
    if (!normalized) return [];

    const mergedLines = mergeContinuationLines(normalized);
    const records = mergedLines.map(parseRecord).filter(Boolean);
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
            if (!target.practiceGroups.some((group) => group.id === record.id)) {
                target.practiceGroups.push(record);
            }
        } else {
            if (!target.theoryGroups.some((group) => group.id === record.id)) {
                target.theoryGroups.push(record);
            }
        }
    }

    return [...grouped.values()];
};

export const buildSelectedSlots = (selectedGroups) => {
    const slots = new Map();

    selectedGroups.forEach((group) => {
        group.schedule.periods.forEach((period) => {
            const key = `${group.schedule.day}-${period}`;
            if (!slots.has(key)) {
                slots.set(key, []);
            }
            slots.get(key).push(group);
        });
    });

    return slots;
};

export const hasConflict = (candidate, selectedGroups) => {
    return selectedGroups.some((group) => {
        if (group.schedule.day !== candidate.schedule.day) return false;
        return group.schedule.periods.some((period) => candidate.schedule.periods.includes(period));
    });
};

export const getConflictLabels = (candidate, selectedGroups) => {
    return selectedGroups
        .filter((group) => {
            if (group.schedule.day !== candidate.schedule.day) return false;
            return group.schedule.periods.some((period) => candidate.schedule.periods.includes(period));
        })
        .map((group) => `${group.code} - ${group.group}`);
};

export const DAY_ORDER = [2, 3, 4, 5, 6, 7, 8];
export const PERIODS = Array.from({ length: 12 }, (_, index) => index + 1);
