import { useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, ChevronDown, ChevronUp, AlertCircle, X, Info } from 'lucide-react';
import {
    DAY_ORDER,
    PERIODS,
    buildSelectedSlots,
    getConflictLabels,
    groupByCourse,
    hasConflict,
    parseTimetableInput,
} from './utils/timetableParser';

const exampleText = `501044 Cấu trúc rời rạc | Discrete Structures 4 01 ---------012----, Thứ 7, Phòng B201, -2345678-01234567
501044 Cấu trúc rời rạc | Discrete Structures 4 01:1 ----123--------, Thứ 4, Phòng A305, ---4567-012-----`;

const dayLabels = {
    2: 'Thứ 2',
    3: 'Thứ 3',
    4: 'Thứ 4',
    5: 'Thứ 5',
    6: 'Thứ 6',
    7: 'Thứ 7',
    8: 'CN',
};

const cellLabel = (value) => `T${value}`;

function App() {
    const [rawText, setRawText] = useState(exampleText);
    const [selected, setSelected] = useState({});
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [isInputOpen, setIsInputOpen] = useState(false); // Collapsible input

    const parsedRecords = useMemo(() => parseTimetableInput(rawText), [rawText]);
    const courses = useMemo(() => groupByCourse(parsedRecords), [parsedRecords]);
    const selectedGroups = useMemo(
        () =>
            Object.values(selected).flatMap((courseSelection) =>
                [courseSelection?.theory, courseSelection?.practice].filter(Boolean),
            ),
        [selected],
    );
    const occupiedSlots = useMemo(() => buildSelectedSlots(selectedGroups), [selectedGroups]);

    const handleSelect = (courseCode, section, group, courseData) => {
        setSelected((current) => {
            const currentCourseSelection = current[courseCode] || { theory: null, practice: null };

            if (currentCourseSelection[section]?.id === group.id) {
                const nextCourseSelection = { ...currentCourseSelection, [section]: null };
                return { ...current, [courseCode]: nextCourseSelection };
            }

            const otherSection = section === 'theory' ? 'practice' : 'theory';
            const otherSelectedNow = currentCourseSelection[otherSection];
            const matchingTheory =
                section === 'practice'
                    ? courseData?.theoryGroups?.find((theoryGroup) => theoryGroup.baseGroup === group.baseGroup) || null
                    : null;

            if (otherSelectedNow && otherSelectedNow.baseGroup !== group.baseGroup) {
                setDownloadStatus(`Không tương thích: nhóm ${group.group} không cùng base với ${otherSelectedNow.group}.`);
                return current;
            }

            const nextCourseSelection = {
                ...currentCourseSelection,
                [section]: group,
                ...(section === 'practice' && matchingTheory ? { theory: matchingTheory } : null),
            };
            const nextSelected = { ...current, [courseCode]: nextCourseSelection };
            const nextGroups = Object.values(nextSelected).flatMap((courseSelection) =>
                [courseSelection?.theory, courseSelection?.practice].filter(Boolean),
            );
            const conflictSource = nextGroups.filter((item) => item.id !== group.id);

            if (hasConflict(group, conflictSource)) {
                setDownloadStatus(`Nhóm ${group.code} - ${group.group} bị trùng lịch.`);
                return current;
            }

            const conflict = nextGroups.some((item, index) =>
                nextGroups.slice(index + 1).some(
                    (candidate) =>
                        item.schedule.day === candidate.schedule.day &&
                        item.schedule.periods.some((period) => candidate.schedule.periods.includes(period)),
                ),
            );

            if (conflict) {
                setDownloadStatus(`Không thể chọn ${group.code} - ${group.group} vì bị xung đột.`);
                return current;
            }

            setDownloadStatus('');
            return nextSelected;
        });
    };

    const deselectGroupById = (id) => {
        setSelected((current) => {
            const next = { ...current };
            for (const code of Object.keys(next)) {
                const sel = next[code];
                if (!sel) continue;
                if (sel.theory?.id === id) next[code] = { ...sel, theory: null };
                if (sel.practice?.id === id) next[code] = { ...sel, practice: null };
            }
            return next;
        });
    };

    const handleHover = (groupOrNull) => {
        setHoveredGroup(groupOrNull);
    };

    const handleDownload = async () => {
        const element = document.getElementById('timetable-capture');
        if (!element) return;

        setDownloadStatus('Đang tạo ảnh...');
        try {
            const canvas = await html2canvas(element, {
                backgroundColor: '#0f172a', // match slate-900
                scale: Math.max(window.devicePixelRatio || 1, 2),
            });

            const link = document.createElement('a');
            link.download = 'tkb.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            setDownloadStatus('Đã tải ảnh TKB.');
            setTimeout(() => setDownloadStatus(''), 3000);
        } catch (e) {
            setDownloadStatus('Lỗi khi tải ảnh.');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/60 backdrop-blur-xl">
                <div className="mx-auto flex max-w-[1800px] items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/20">
                            <span className="text-lg font-bold text-white">T</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white">Timetable Simulator</h1>
                            <p className="text-xs font-medium text-slate-400">Manage your university schedule with ease</p>
                        </div>
                    </div>
                    
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="group flex items-center gap-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-400 transition-all hover:bg-cyan-500 hover:text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                    >
                        <Download className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                        Tải Ảnh
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-[1800px] p-6">
                <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
                    
                    {/* Left Column: Data Input & Course Selection */}
                    <div className="flex w-full flex-col gap-6 xl:w-[45%] 2xl:w-[40%]">
                        
                        {/* Data Input Section */}
                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-md shadow-xl transition-all">
                            <button
                                onClick={() => setIsInputOpen(!isInputOpen)}
                                className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-white/5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-indigo-500/20 p-2 text-indigo-400">
                                        <Info className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-semibold text-white">Dữ liệu nguồn ({courses.length} môn)</h2>
                                        <p className="text-xs text-slate-400">Dán dữ liệu thô để phân tích thời khóa biểu.</p>
                                    </div>
                                </div>
                                {isInputOpen ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                            </button>
                            
                            <div className={`grid transition-[grid-template-rows] duration-300 ${isInputOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                <div className="overflow-hidden">
                                    <div className="border-t border-white/5 p-5 pt-0">
                                        <textarea
                                            value={rawText}
                                            onChange={(event) => setRawText(event.target.value)}
                                            className="mt-4 h-40 w-full resize-none rounded-xl border border-white/10 bg-slate-950 p-4 text-sm leading-relaxed text-slate-300 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                            placeholder="Dán dữ liệu TKB thô vào đây..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status Messages */}
                        {downloadStatus && (
                            <div className="flex items-center gap-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-4 text-sm text-cyan-200 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="h-4 w-4" />
                                {downloadStatus}
                            </div>
                        )}

                        {/* Course List */}
                        <div className="flex flex-col gap-4">
                            {courses.map((course) => {
                                const courseSelection = selected[course.code] || { theory: null, practice: null };

                                return (
                                    <div
                                        key={course.code}
                                        className="group relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-sm transition-all hover:border-white/10 hover:bg-slate-900/60 shadow-lg"
                                    >
                                        {/* Status Indicator Bar */}
                                        <div className={`absolute left-0 top-0 h-full w-1 transition-colors ${
                                            (courseSelection.theory || courseSelection.practice) ? 'bg-cyan-500' : 'bg-transparent'
                                        }`} />

                                        <div className="mb-5 flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-100 group-hover:text-cyan-50 transition-colors">
                                                    {course.code} - {course.courseName}
                                                </h3>
                                                <p className="mt-1 text-xs font-medium text-slate-400">
                                                    {course.englishName || 'No English name'} <span className="mx-1.5 opacity-50">•</span> {course.credits} tín chỉ
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <GroupSection
                                                title="Nhóm Lý Thuyết"
                                                groups={course.theoryGroups}
                                                selectedGroup={courseSelection.theory}
                                                selectedGroups={selectedGroups}
                                                onSelect={handleSelect}
                                                onHover={handleHover}
                                                courseCode={course.code}
                                                section="theory"
                                                courseSelection={courseSelection}
                                                courseData={course}
                                            />
                                            {course.practiceGroups && course.practiceGroups.length > 0 && (
                                                <GroupSection
                                                    title="Nhóm Thực Hành"
                                                    groups={course.practiceGroups}
                                                    selectedGroup={courseSelection.practice}
                                                    selectedGroups={selectedGroups}
                                                    onSelect={handleSelect}
                                                    onHover={handleHover}
                                                    courseCode={course.code}
                                                    section="practice"
                                                    courseSelection={courseSelection}
                                                    courseData={course}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Timetable Grid */}
                    <div className="w-full xl:sticky xl:top-24 xl:w-[55%] 2xl:w-[60%]">
                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
                            <div className="border-b border-white/5 bg-slate-900/50 p-5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Preview TKB</h2>
                                    <p className="text-xs text-slate-400 mt-1">Click vào môn đã chọn trên bảng để hủy bỏ.</p>
                                </div>
                                <div className="flex flex-wrap gap-2 justify-end max-w-[50%]">
                                    {selectedGroups.map((group) => (
                                        <span key={group.id} className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-300">
                                            {group.code} - {group.group}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            <div id="timetable-capture" className="p-6 bg-slate-900">
                                <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/50 shadow-inner">
                                    <div className="min-w-[700px]">
                                        {/* Header Row */}
                                        <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-white/5 bg-slate-900/40 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                            <div className="p-3 text-center">Tiết</div>
                                            {DAY_ORDER.map((day) => (
                                                <div key={day} className="border-l border-white/5 p-3 text-center">
                                                    {dayLabels[day]}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Grid Rows */}
                                        {PERIODS.map((period) => (
                                            <div key={period} className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-white/5 last:border-b-0">
                                                <div className="flex items-center justify-center border-r border-white/5 bg-slate-900/20 p-2 text-xs font-medium text-slate-500">
                                                    {cellLabel(period)}
                                                </div>
                                                
                                                {DAY_ORDER.map((day) => {
                                                    const slotKey = `${day}-${period}`;
                                                    const entries = occupiedSlots.get(slotKey) || [];
                                                    const entry = entries[0];
                                                    const isHoveredSlot = hoveredGroup && hoveredGroup.schedule.day === day && hoveredGroup.schedule.periods.includes(period);

                                                    return (
                                                        <div
                                                            key={slotKey}
                                                            onClick={() => entry && deselectGroupById(entry.id)}
                                                            className={`relative min-h-[90px] border-l border-white/5 p-1.5 transition-all
                                                                ${entry ? 'cursor-pointer hover:bg-slate-800/50' : 'bg-transparent'} 
                                                                ${isHoveredSlot ? 'bg-cyan-500/5' : ''}`}
                                                        >
                                                            {entry && (
                                                                <div className="group/cell flex h-full flex-col justify-between rounded-lg border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-2 text-left shadow-sm transition-all hover:border-cyan-400/40 hover:shadow-cyan-500/10">
                                                                    <div className="flex items-start justify-between gap-1">
                                                                        <div className="font-semibold text-cyan-300 text-xs truncate">
                                                                            {entry.code} <span className="opacity-60 font-normal">· {entry.group}</span>
                                                                        </div>
                                                                        {/* Delete Icon on Hover */}
                                                                        <div className="opacity-0 group-hover/cell:opacity-100 transition-opacity bg-rose-500/20 text-rose-300 rounded-full p-0.5 mt-[-2px] mr-[-2px]">
                                                                            <X className="h-3 w-3" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-cyan-100/70">
                                                                        {entry.courseName}
                                                                    </div>
                                                                    <div className="mt-1.5 text-[10px] font-medium text-slate-400 flex justify-between items-center">
                                                                        <span>{entry.schedule.room}</span>
                                                                        <span>{entry.schedule.periodLabel}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {!entry && isHoveredSlot && (
                                                                <div className="h-full rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-2 flex flex-col items-center justify-center text-center opacity-70 animate-pulse">
                                                                    <span className="text-xs font-semibold text-cyan-400">{hoveredGroup.code}</span>
                                                                    <span className="text-[10px] text-cyan-300/80">{hoveredGroup.group}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function GroupSection({ title, groups, selectedGroup, selectedGroups, onSelect, onHover, courseCode, section, courseSelection, courseData }) {
    if (!groups || groups.length === 0) return null;

    return (
        <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                <div className="h-1 w-1 rounded-full bg-slate-600" />
                {title}
            </div>
            <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                    const selectedItem = selectedGroup?.id === group.id;
                    const conflictSource = selectedGroups.filter((item) => item.id !== selectedGroup?.id);
                    const otherSection = section === 'theory' ? 'practice' : 'theory';
                    const otherSelected = courseSelection?.[otherSection];
                    const compatible = !otherSelected || otherSelected.baseGroup === group.baseGroup;
                    const isConflict = hasConflict(group, conflictSource);
                    const isDisabled = !selectedItem && (isConflict || !compatible);
                    
                    const conflictLabels = getConflictLabels(group, conflictSource);
                    const incompatibilityLabel = !compatible ? `Không cùng base với ${otherSelected.group}` : '';
                    
                    let btnClass = 'border-white/10 bg-slate-800/50 text-slate-300 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-100';
                    if (selectedItem) {
                        btnClass = 'border-cyan-500 bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:bg-cyan-400 hover:border-cyan-400';
                    } else if (isDisabled) {
                        btnClass = 'border-rose-500/20 bg-rose-500/5 text-rose-300/50 cursor-not-allowed';
                    }

                    return (
                        <div key={group.id} className="relative group/tooltip flex flex-col items-center">
                            <button
                                type="button"
                                onClick={() => onSelect(courseCode, section, group, courseData)}
                                onMouseEnter={() => onHover?.(group)}
                                onMouseLeave={() => onHover?.(null)}
                                disabled={isDisabled}
                                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all ${btnClass}`}
                            >
                                {group.group}
                            </button>
                            
                            {/* Tooltip for schedules */}
                            <div className="pointer-events-none absolute -top-10 z-10 w-max translate-y-2 opacity-0 transition-all group-hover/tooltip:-translate-y-0 group-hover/tooltip:opacity-100">
                                <div className="rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 shadow-xl border border-white/10">
                                    {group.schedule.dayLabel} • {group.schedule.periodLabel} • {group.schedule.room}
                                    {isDisabled && <div className="text-rose-400 mt-0.5">{conflictLabels.join(', ') || incompatibilityLabel}</div>}
                                </div>
                                {/* Tooltip Arrow */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-slate-800"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default App;