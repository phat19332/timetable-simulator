import { useMemo, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { Download, ChevronDown, ChevronUp, AlertCircle, X, Info, Sparkles, Key, Loader2 } from 'lucide-react';
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
    2: 'Monday',
    3: 'Tuesday',
    4: 'Wednesday',
    5: 'Thursday',
    6: 'Friday',
    7: 'Saturday',
    8: 'Sunday',
};

const cellLabel = (value) => `T${value}`;

function App() {
    const [rawText, setRawText] = useState(exampleText);
    const [selected, setSelected] = useState({});
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [isInputOpen, setIsInputOpen] = useState(false); // Collapsible input

    // AI States
    const [apiConfig, setApiConfig] = useState(() => {
        const saved = localStorage.getItem('ai_api_config');
        if (saved) return JSON.parse(saved);
        return { provider: 'gemini', baseUrl: '', model: 'gemini-1.5-flash', apiKey: '' };
    });
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showApiModal, setShowApiModal] = useState(false);
    const [apiError, setApiError] = useState('');
    const [aiCustomPrompt, setAiCustomPrompt] = useState('');

    useEffect(() => {
        localStorage.setItem('ai_api_config', JSON.stringify(apiConfig));
    }, [apiConfig]);

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
                setDownloadStatus(`Incompatible: Group ${group.group} does not share the same base as ${otherSelectedNow.group}.`);
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
                setDownloadStatus(`Group ${group.code} - ${group.group} has a schedule conflict.`);
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
                setDownloadStatus(`Cannot select ${group.code} - ${group.group} due to conflict.`);
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

        setDownloadStatus('Generating image...');
        try {
            const canvas = await html2canvas(element, {
                backgroundColor: '#0f172a', // match slate-900
                scale: Math.max(window.devicePixelRatio || 1, 2),
            });

            const link = document.createElement('a');
            link.download = 'tkb.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            setDownloadStatus('Timetable image downloaded.');
            setTimeout(() => setDownloadStatus(''), 3000);
        } catch (e) {
            setDownloadStatus('Error downloading image.');
        }
    };

    const handleAutoFillWithAI = async () => {
        if (!apiConfig.apiKey) {
            setShowApiModal(true);
            return;
        }

        if (courses.length === 0) {
            setDownloadStatus('No courses available to schedule.');
            return;
        }

        setIsAiLoading(true);
        setApiError('');
        setDownloadStatus('AI is analyzing... This might take 1-2 minutes. Tip: You can open a new tab to schedule manually while waiting.');

        try {
            const simplifiedCourses = courses.map(c => ({
                code: c.code,
                theoryGroups: c.theoryGroups.map(g => ({ id: g.id, baseGroup: g.baseGroup, day: g.schedule.day, periods: g.schedule.periods })),
                practiceGroups: c.practiceGroups.map(g => ({ id: g.id, baseGroup: g.baseGroup, day: g.schedule.day, periods: g.schedule.periods }))
            }));

            const prompt = `You are an expert university scheduling assistant. I have a list of courses. For each course, select exactly one theory group, and if practice groups exist, select exactly one practice group.
RULES:
1. No schedule conflicts: Day and periods cannot overlap between ANY selected groups across all courses.
2. Base group match: For a single course, the selected theory and practice group MUST have the exact same 'baseGroup' string.
3. Maximize course selection: Try to schedule as many courses as possible without conflicts.
${aiCustomPrompt ? `\nUSER SPECIFIC REQUIREMENTS (CRITICAL):\n${aiCustomPrompt}\n` : ''}
Here is the courses data in JSON:
${JSON.stringify(simplifiedCourses)}

Return ONLY a JSON array of objects. Do not include markdown formatting like \`\`\`json. Each object must represent a course selection and have this exact structure:
[
  {
    "courseCode": "string",
    "theoryGroupId": "string", 
    "practiceGroupId": "string | null" 
  }
]
Output ONLY valid JSON.`;

            let text = "";

            if (apiConfig.provider === 'gemini') {
                const defaultModels = [
                    'gemini-3-flash-preview',
                    'gemini-1.5-flash', 
                    'gemini-1.5-flash-8b',
                    'gemini-1.5-flash-latest', 
                    'gemini-1.5-pro', 
                    'gemini-pro'
                ];
                const modelsToTry = apiConfig.model ? [apiConfig.model, ...defaultModels] : defaultModels;
                let success = false;
                let lastError = null;

                for (const currentModel of modelsToTry) {
                    try {
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel.trim()}:generateContent?key=${apiConfig.apiKey.trim()}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: prompt }] }],
                                generationConfig: { temperature: 0.1 }
                            })
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error?.message || `Failed to fetch from Gemini API (${currentModel})`);
                        }

                        const data = await response.json();
                        text = data.candidates[0].content.parts[0].text;
                        success = true;
                        break; // Stop if successful
                    } catch (e) {
                        lastError = e;
                        console.warn(`Model ${currentModel} failed, trying next...`);
                    }
                }

                if (!success) {
                    throw lastError || new Error("All Gemini models failed to process the request.");
                }
            } else {
                const url = apiConfig.baseUrl || 'https://api.openai.com/v1/chat/completions';
                const model = apiConfig.model || 'gpt-3.5-turbo';
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "system", content: "You are a scheduling assistant. Return ONLY valid JSON array without formatting." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.1
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || 'Failed to fetch from OpenAI API');
                }

                const data = await response.json();
                text = data.choices[0].message.content;
            }
            
            // Robust JSON extraction: Find the first '[' and last ']'
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error("AI did not return a valid JSON array. Try again or check your prompt.");
            }
            text = jsonMatch[0];
            
            const aiSelections = JSON.parse(text);
            
            if (!Array.isArray(aiSelections)) {
                throw new Error("AI response format is invalid (not an array).");
            }

            // Apply selections
            const newSelected = {};
            let matchCount = 0;
            aiSelections.forEach(selection => {
                const course = courses.find(c => c.code === selection.courseCode);
                if (course) {
                    const theory = course.theoryGroups.find(g => g.id === selection.theoryGroupId) || null;
                    const practice = course.practiceGroups.find(g => g.id === selection.practiceGroupId) || null;
                    if (theory || practice) {
                        newSelected[course.code] = { theory, practice };
                        matchCount++;
                    }
                }
            });

            if (matchCount === 0) {
                throw new Error("AI suggested groups but they don't match your source data IDs.");
            }

            setSelected(newSelected);
            setDownloadStatus(`AI has successfully scheduled ${matchCount} courses!`);
            setTimeout(() => setDownloadStatus(''), 4000);

        } catch (error) {
            console.error("AI Error Debug:", error);
            setApiError(`Error: ${error.message}`);
            setDownloadStatus('');
            setShowApiModal(true);
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30 relative">
            
            {/* API Key Modal */}
            {showApiModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
                        <div className="border-b border-white/5 bg-slate-800/50 p-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Key className="h-5 w-5 text-cyan-400" />
                                AI API Configuration
                            </h3>
                            <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-white">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            <p className="text-sm text-slate-300">
                                Connect any AI provider to auto-fill the timetable. Stored securely in your browser.
                            </p>
                            
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Provider Format</label>
                                <select 
                                    value={apiConfig.provider} 
                                    onChange={e => setApiConfig({...apiConfig, provider: e.target.value})}
                                    className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-slate-100 focus:border-cyan-500/50 focus:outline-none"
                                >
                                    <option value="gemini">Google Gemini</option>
                                    <option value="openai">OpenAI Compatible (ChatGPT, DeepSeek, Groq)</option>
                                </select>
                            </div>

                            {apiConfig.provider === 'openai' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Base URL (Leave blank for OpenAI)</label>
                                    <input
                                        type="text"
                                        value={apiConfig.baseUrl}
                                        onChange={(e) => setApiConfig({...apiConfig, baseUrl: e.target.value})}
                                        placeholder="https://api.openai.com/v1/chat/completions"
                                        className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Model Name {apiConfig.provider === 'gemini' && "(Optional)"}</label>
                                <input
                                    type="text"
                                    value={apiConfig.model}
                                    onChange={(e) => setApiConfig({...apiConfig, model: e.target.value})}
                                    placeholder={apiConfig.provider === 'gemini' ? "Auto-detect (Default: gemini-3-flash-preview)" : "gpt-3.5-turbo"}
                                    className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={apiConfig.apiKey}
                                    onChange={(e) => setApiConfig({...apiConfig, apiKey: e.target.value})}
                                    placeholder="sk-..."
                                    className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
                                />
                            </div>

                            {apiError && (
                                <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
                                    {apiError}
                                </div>
                            )}
                            <div className="mt-2 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowApiModal(false)}
                                    className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => {
                                        setShowApiModal(false);
                                        if (apiConfig.apiKey) handleAutoFillWithAI();
                                    }}
                                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                                >
                                    Save & Run
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                        Download Image
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
                                        <h2 className="text-base font-semibold text-white">Source Data ({courses.length} courses)</h2>
                                        <p className="text-xs text-slate-400">Paste raw data to analyze the timetable.</p>
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
                                            placeholder="Paste raw timetable data here..."
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

                        {/* AI Assistant Panel */}
                        <div className="flex flex-col gap-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 p-5 shadow-lg backdrop-blur-md">
                            <div>
                                <h3 className="text-sm font-semibold text-cyan-50 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-cyan-400" /> AI Auto-Schedule
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">Let AI automatically find the best non-conflicting schedule for you.</p>
                            </div>
                            
                            <textarea
                                value={aiCustomPrompt}
                                onChange={(e) => setAiCustomPrompt(e.target.value)}
                                placeholder="Any specific requirements? (e.g., 'Avoid Mondays', 'No more than 4 classes a day', 'Try to schedule classes in the morning')"
                                className="w-full h-20 resize-none rounded-xl border border-white/10 bg-slate-950/80 p-3 text-sm text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
                            />

                            <div className="flex items-center justify-between mt-1">
                                <button
                                    onClick={() => setShowApiModal(true)}
                                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
                                    title="Configure API Key"
                                >
                                    <Key className="h-3 w-3" /> API Config
                                </button>
                                <button
                                    onClick={handleAutoFillWithAI}
                                    disabled={isAiLoading || courses.length === 0}
                                    className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAiLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" />
                                    )}
                                    {isAiLoading ? 'Scheduling...' : 'Auto-fill'}
                                </button>
                            </div>
                            {isAiLoading && (
                                <div className="mt-2 rounded-lg bg-blue-500/10 p-3 text-xs leading-relaxed text-blue-300 border border-blue-500/20 animate-pulse">
                                    <span className="font-semibold text-blue-200">Please wait:</span> AI is computing combinations. This process may take 1-3 minutes. 
                                    <br/><br/>
                                    <span className="opacity-80 text-blue-200/70">Tip: While waiting, you can duplicate this tab to build a manual schedule as backup.</span>
                                </div>
                            )}
                        </div>

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
                                                    {course.englishName || 'No English name'} <span className="mx-1.5 opacity-50">•</span> {course.credits} credits
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <GroupSection
                                                title="Theory Group"
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
                                                    title="Practice Group"
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
                                    <h2 className="text-lg font-semibold text-white">Timetable Preview</h2>
                                    <p className="text-xs text-slate-400 mt-1">Click a selected course on the grid to remove it.</p>
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
                                            <div className="p-3 text-center">Period</div>
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
                    const incompatibilityLabel = !compatible ? `Base mismatch with ${otherSelected.group}` : '';
                    
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