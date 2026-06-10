import {
    useState,
    useRef,
    useEffect,
    ChangeEvent,
    forwardRef,
    useImperativeHandle,
} from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";

import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
    ChevronLeft,
    ChevronRight,
    Check,
    X,
    Info,
    PanelBottomClose,
    CircleCheckBig,
    CircleX,
} from 'lucide-react';

/* ================================
   Types and Interfaces
================================ */

interface Line {
    number: number;
    text: string;
}

interface Connection {
    factIndex: number;
    lineNumber: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
}

interface Instance {
    id: string;
    idx: number;
    SystemName: string;
    orginal?: string;
    original?: string;
    simplified: string;
    source: string;
    displayType: 'simplified' | 'original';
    keyFacts: string[];
}

interface SavedFactAnnotation {
    'key fact': string;
    response: string;
    Operation: string;
    'line number': number[];
}

interface AnnotationState {
    connections: Record<string, Connection[]>;
    annotationStatus: Record<string, Record<number, string>>;
    instanceComments: Record<string, string>;
    completenessScores: Record<string, number>;
    faithfulnessScores: Record<string, number>;
    currentInstanceIndex: number;
}

interface AnnotationFile {
    instances: Instance[];
    state?: AnnotationState;
    results?: any;
}

interface FactCheckerUIHandle {
    downloadAll: () => Promise<void>;
}

/* ================================
   FactCheckerUI Component
================================ */

interface FactCheckerUIProps {
    instances: Instance[];
    initialState?: AnnotationState;
}

const FactCheckerUI = forwardRef<FactCheckerUIHandle, FactCheckerUIProps>(
    ({ instances, initialState }, ref) => {
        const [selectedFactIndex, setSelectedFactIndex] = useState<number | null>(null);

        const [currentInstanceIndex, setCurrentInstanceIndex] = useState(0);
        const [submitMessage, setSubmitMessage] = useState<string | null>(null);
        const [submitMessageType, setSubmitMessageType] = useState<'success' | 'error'>('success');

        const [connections, setConnections] = useState<Record<string, Connection[]>>({});
        const [annotationStatus, setAnnotationStatus] = useState<Record<string, Record<number, string>>>({});
        const [annotations, setAnnotations] = useState<Record<string, SavedFactAnnotation[]>>({});
        const [instanceComments, setInstanceComments] = useState<Record<string, string>>({});
        const [completenessScores, setCompletenessScores] = useState<Record<string, number>>({});
        const [faithfulnessScores, setFaithfulnessScores] = useState<Record<string, number>>({});

        const [summaryLines, setSummaryLines] = useState<Line[]>([]);
        const svgRef = useRef<SVGSVGElement>(null);
        const factRefs = useRef<Record<number, HTMLDivElement | null>>({});
        const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
        const panelsRef = useRef<HTMLDivElement>(null);

        const [scrollVersion, setScrollVersion] = useState(0);
        const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

        const factPaneRef = useRef<HTMLDivElement>(null);
        const linePaneRef = useRef<HTMLDivElement>(null);

        const currentInstance = instances[currentInstanceIndex];

        const handleScroll = () => setScrollVersion(v => v + 1);

        const getOriginalText = (inst: Instance) => {
            return inst.orginal || inst.original || '';
        };

        const buildInstanceAnnotations = (inst: Instance): SavedFactAnnotation[] => {
            const id = inst.id;
            const instanceConnections = connections[id] || [];

            return inst.keyFacts.map((fact, i) => {
                const conns = instanceConnections.filter(c => c.factIndex === i);

                return {
                    'key fact': fact,
                    response: conns.length ? 'Yes' : 'No',
                    Operation: conns.length ? 'Connected' : annotationStatus[id]?.[i] || '',
                    'line number': conns.map(c => c.lineNumber),
                };
            });
        };

        const calculateScore = (inst: Instance, arr: SavedFactAnnotation[]) => {
            const scored = arr
                .map(a => a.Operation)
                .filter(op => op && op !== 'Wrong Key Fact');

            const good = scored.filter(op =>
                inst.displayType === 'simplified'
                    ? (op === 'Connected' || op === 'good deletion')
                    : (op === 'Connected' || op === 'elaboration')
            ).length;

            return scored.length ? (good / scored.length) * 100 : 0;
        };

        useEffect(() => {
            if (!initialState) return;

            setConnections(initialState.connections || {});
            setAnnotationStatus(initialState.annotationStatus || {});
            setInstanceComments(initialState.instanceComments || {});
            setCompletenessScores(initialState.completenessScores || {});
            setFaithfulnessScores(initialState.faithfulnessScores || {});

            const maxIndex = Math.max(instances.length - 1, 0);
            const savedIndex = initialState.currentInstanceIndex ?? 0;
            setCurrentInstanceIndex(Math.min(savedIndex, maxIndex));
        }, [initialState, instances.length]);

        useEffect(() => {
            const update = () => {
                if (!panelsRef.current) return;
                const { width: w, height: h } = panelsRef.current.getBoundingClientRect();
                setSvgSize({ w, h });
            };

            update();
            window.addEventListener('resize', update);

            return () => window.removeEventListener('resize', update);
        }, []);

        useEffect(() => {
            if (!panelsRef.current) return;
            const { width: w, height: h } = panelsRef.current.getBoundingClientRect();
            setSvgSize({ w, h });
        }, [scrollVersion, currentInstanceIndex]);

        useEffect(() => {
            setScrollVersion(v => v + 1);

            if (factPaneRef.current) factPaneRef.current.scrollTop = 0;
            if (linePaneRef.current) linePaneRef.current.scrollTop = 0;

            setSelectedFactIndex(null);
        }, [currentInstanceIndex]);

        useEffect(() => {
            if (!instances.length) return;

            const inst = instances[currentInstanceIndex];
            const raw =
                inst.displayType === 'simplified'
                    ? inst.simplified || ''
                    : getOriginalText(inst);

            const lines = raw
                .split('\n')
                .filter(l => l.trim())
                .map((l, i) => ({
                    number: i + 1,
                    text: l.replace(/^\[\d+\]\s*/, ''),
                }));

            setSummaryLines(lines);

            setConnections(c => {
                if (c[inst.id]) return c;
                return { ...c, [inst.id]: [] };
            });
        }, [currentInstanceIndex, instances]);

        useEffect(() => {
            if (!instances.length) return;

            const inst = instances[currentInstanceIndex];
            const id = inst.id;

            const arr = buildInstanceAnnotations(inst);
            setAnnotations(a => ({ ...a, [id]: arr }));

            const pct = calculateScore(inst, arr);

            if (inst.displayType === 'simplified') {
                setCompletenessScores(s => ({ ...s, [id]: pct }));
            } else {
                setFaithfulnessScores(f => ({ ...f, [id]: pct }));
            }
        }, [connections, annotationStatus, currentInstanceIndex, instances]);

        const hasConn = (i: number) => {
            if (!currentInstance) return false;
            return Boolean(connections[currentInstance.id]?.some(c => c.factIndex === i));
        };

        const handleAnnot = (i: number, t: string) => {
            const id = instances[currentInstanceIndex].id;

            setAnnotationStatus(s => ({
                ...s,
                [id]: { ...(s[id] || {}), [i]: t },
            }));
        };

        const canProceed = () => {
            if (!currentInstance) return false;

            return currentInstance.keyFacts.every(
                (_, i) =>
                    hasConn(i) ||
                    annotationStatus[currentInstance.id]?.[i]
            );
        };

        const handleLineClick = (ln: number) => {
            if (selectedFactIndex === null) return;

            const container = panelsRef.current;
            const factEl = factRefs.current[selectedFactIndex];
            const lineEl = lineRefs.current[ln];

            if (!container || !factEl || !lineEl) {
                console.warn('Missing ref on click:', { container, factEl, lineEl });
                setSelectedFactIndex(null);
                return;
            }

            const cR = container.getBoundingClientRect();
            const fR = factEl.getBoundingClientRect();
            const lR = lineEl.getBoundingClientRect();

            const start = {
                x: fR.left + fR.width / 2 - cR.left,
                y: fR.top + fR.height / 2 - cR.top,
            };

            const end = {
                x: lR.left - cR.left,
                y: lR.top + lR.height / 2 - cR.top,
            };

            const instId = instances[currentInstanceIndex].id;

            const newConn: Connection = {
                factIndex: selectedFactIndex,
                lineNumber: ln,
                start,
                end,
            };

            setConnections(c => {
                const prev = c[instId] || [];
                const filtered = prev.filter(
                    x => !(x.factIndex === selectedFactIndex && x.lineNumber === ln)
                );

                return { ...c, [instId]: [...filtered, newConn] };
            });

            setSelectedFactIndex(null);
        };

        const removeConn = (i: number) => {
            const instId = instances[currentInstanceIndex].id;
            const toDel = connections[instId]?.[i];

            if (!toDel) return;

            setConnections(c => ({
                ...c,
                [instId]: c[instId].filter((_, idx) => idx !== i),
            }));
        };

        const downloadAll = async () => {
            try {
                const nextCompletenessScores: Record<string, number> = { ...completenessScores };
                const nextFaithfulnessScores: Record<string, number> = { ...faithfulnessScores };

                const results = instances.map(inst => {
                    const arr = buildInstanceAnnotations(inst);
                    const scoreValue = calculateScore(inst, arr);

                    const scoreKey =
                        inst.displayType === 'simplified'
                            ? 'completeness'
                            : 'faithfulness';

                    if (inst.displayType === 'simplified') {
                        nextCompletenessScores[inst.id] = scoreValue;
                    } else {
                        nextFaithfulnessScores[inst.id] = scoreValue;
                    }

                    return {
                        instanceidx: inst.idx,
                        instanceId: inst.id,
                        SystemName: inst.SystemName,
                        orginal: getOriginalText(inst),
                        simplified: inst.simplified,
                        source: inst.source,
                        keyFacts: arr,
                        comment: instanceComments[inst.id] || '',
                        [scoreKey]: scoreValue,
                    };
                });

                const normalizedInstances = instances.map(inst => ({
                    ...inst,
                    orginal: getOriginalText(inst),
                }));

                const state: AnnotationState = {
                    connections,
                    annotationStatus,
                    instanceComments,
                    completenessScores: nextCompletenessScores,
                    faithfulnessScores: nextFaithfulnessScores,
                    currentInstanceIndex,
                };

                const out: AnnotationFile = {
                    instances: normalizedInstances,
                    state,
                    results,
                };

                const json = JSON.stringify(out, null, 2);
                const blob = new Blob([json], { type: "application/json;charset=utf-8" });
                const url = URL.createObjectURL(blob);

                const filename = `m2preserve_annotations.json`;

                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();

                URL.revokeObjectURL(url);

                setCompletenessScores(nextCompletenessScores);
                setFaithfulnessScores(nextFaithfulnessScores);

                setSubmitMessage(
                    "Annotations saved to file. You can upload this file later to continue where you left off."
                );
                setSubmitMessageType("success");
            } catch (err) {
                console.error("Download failed:", err);
                setSubmitMessage("Failed to prepare download. Please try again.");
                setSubmitMessageType("error");
            }
        };

        useImperativeHandle(ref, () => ({
            downloadAll,
        }));

        if (!instances.length || !currentInstance) {
            return <div>No instances loaded.</div>;
        }

        return (
            <div className="relative w-full max-w-6xl mx-auto p-6 min-h-[600px]">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <Button
                        variant="outline"
                        onClick={() => setCurrentInstanceIndex(i => Math.max(i - 1, 0))}
                        disabled={currentInstanceIndex === 0}
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                    </Button>

                    <div className="text-center">
                        <div className="font-medium">
                            Instance {currentInstanceIndex + 1} of {instances.length}
                        </div>
                        <div className="text-sm text-gray-500">ID: {currentInstance.id}</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() =>
                                setCurrentInstanceIndex(i =>
                                    Math.min(i + 1, instances.length - 1)
                                )
                            }
                            disabled={!canProceed() || currentInstanceIndex === instances.length - 1}
                        >
                            Next <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>

                        <Drawer>
                            <DrawerTrigger asChild>
                                <Button variant="outline">
                                    Instructions <Info className="w-4 h-4 ml-1" color="blue" />
                                </Button>
                            </DrawerTrigger>

                            <DrawerContent>
                                <div className="mx-auto w-full max-w-2xl">
                                    <DrawerHeader>
                                        <DrawerTitle>
                                            <strong>Annotation Instructions</strong>
                                        </DrawerTitle>
                                    </DrawerHeader>

                                    <Separator className="my-4" />

                                    <div className="mt-4 space-y-6">
                                        {currentInstance.displayType === 'simplified' ? (
                                            <div className="border p-4 rounded-lg bg-gray-50">
                                                <p className="mb-2">
                                                    <strong>Completeness Evaluation</strong>
                                                </p>

                                                <p className="mb-2">
                                                    <strong>You will be provided with:</strong>
                                                </p>

                                                <ul className="list-disc ml-6 mb-4">
                                                    <li>The <strong>original text</strong></li>
                                                    <li>
                                                        A <strong>list of key facts</strong> extracted from
                                                        the <strong>original</strong> text.
                                                    </li>
                                                    <li>
                                                        The <strong>simplified text</strong>, split into
                                                        sentences.
                                                    </li>
                                                </ul>

                                                <p className="mb-2">
                                                    Your task is to assess whether each key fact from the
                                                    original text can be clearly inferred from the simplified text.
                                                </p>

                                                <Separator className="my-4" />

                                                <div className="mt-2">
                                                    <p className="font-semibold">Steps:</p>

                                                    <ol className="list-decimal ml-6 mt-1">
                                                        <li className="mb-2">
                                                            Check if the key fact can be clearly inferred from
                                                            the simplified text, either explicitly or implicitly,
                                                            even if paraphrased.
                                                        </li>
                                                        <li className="mb-2">
                                                            If the key fact can be clearly inferred, connect it to
                                                            the corresponding sentence(s) in the simplified text.
                                                        </li>
                                                        <li className="mb-2">
                                                            If the key fact cannot be clearly inferred, classify it
                                                            as one of the following:
                                                        </li>
                                                    </ol>

                                                    <ul className="list-disc ml-6 mt-1">
                                                        <li>
                                                            <span className="italic font-medium">Wrong Key Fact</span>:
                                                            the key fact was <strong>not correctly</strong> extracted
                                                            from the <strong>original</strong> text.
                                                        </li>
                                                        <li>
                                                            <span className="italic font-medium">Bad Deletion</span>:
                                                            the key fact is omitted, and this information is critical;
                                                            its absence does obfuscate the main idea of the original text.
                                                        </li>
                                                        <li>
                                                            <span className="italic font-medium">Good Deletion</span>:
                                                            the key fact is omitted, but the information is not essential;
                                                            its absence does not obfuscate the main idea of the original text.
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="border p-4 rounded-lg bg-gray-50">
                                                <p className="mb-2">
                                                    <strong>Faithfulness Evaluation</strong>
                                                </p>

                                                <p className="mb-2">
                                                    <strong>You will be provided with:</strong>
                                                </p>

                                                <ul className="list-disc ml-6 mb-4">
                                                    <li>A <strong>simplified text</strong></li>
                                                    <li>
                                                        A <strong>list of key facts</strong> extracted from
                                                        the <strong>simplified</strong> text.
                                                    </li>
                                                    <li>
                                                        The <strong>original text</strong>, split into sentences.
                                                    </li>
                                                </ul>

                                                <p className="mb-2">
                                                    Your task is to determine whether each key fact from the
                                                    simplified text is accurately supported by the original text.
                                                </p>

                                                <Separator className="my-4" />

                                                <div className="mt-2">
                                                    <p className="font-semibold">Steps:</p>

                                                    <ol className="list-decimal ml-6 mt-1">
                                                        <li className="mb-2">
                                                            Check if the key fact is accurately represented in
                                                            the original text, either explicitly or implicitly,
                                                            even if paraphrased.
                                                        </li>
                                                        <li className="mb-2">
                                                            If accurately represented, connect the key fact to
                                                            the corresponding sentence(s) in the original text.
                                                        </li>
                                                        <li className="mb-2">
                                                            If the fact is <strong>not accurately represented</strong>,
                                                            classify it as one of the following:
                                                        </li>
                                                    </ol>

                                                    <ul className="list-disc ml-6 mt-1">
                                                        <li>
                                                            <span className="italic font-medium">Wrong Key Fact</span>:
                                                            the key fact was <strong>not correctly</strong> extracted
                                                            from the <strong>simplified</strong> text.
                                                        </li>
                                                        <li>
                                                            <span className="italic font-medium">Factual Error</span>:
                                                            the key fact introduces misleading, incorrect, or fabricated
                                                            information not present in the original text.
                                                        </li>
                                                        <li>
                                                            <span className="italic font-medium">Elaboration</span>:
                                                            the key fact provides additional details, examples, background
                                                            information, or definitions that are accurate but not explicitly
                                                            mentioned in the original text.
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <DrawerFooter>
                                        <DrawerClose asChild>
                                            <Button variant="outline">
                                                Close <PanelBottomClose className="w-4 h-4 ml-1" />
                                            </Button>
                                        </DrawerClose>
                                    </DrawerFooter>
                                </div>
                            </DrawerContent>
                        </Drawer>
                    </div>
                </div>

                {/* Evaluation Title */}
                <h2 className="text-center font-bold">
                    {currentInstance.displayType === 'simplified'
                        ? 'Completeness Evaluation'
                        : 'Faithfulness Evaluation'}
                </h2>

                <Separator className="my-3" />

                {/* Text Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {currentInstance.displayType === 'simplified'
                                ? 'Original Text'
                                : 'Simplified Text'}
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        {currentInstance.displayType === 'simplified'
                            ? getOriginalText(currentInstance)
                            : currentInstance.simplified}
                    </CardContent>
                </Card>

                <Separator className="my-3" />

                {/* Key Facts and Sentences */}
                <div ref={panelsRef} className="relative grid grid-cols-2 gap-y-6 gap-x-60">
                    {/* Key Facts */}
                    <div
                        ref={factPaneRef}
                        className="max-h-[60vh] overflow-y-auto pr-4"
                        onScroll={handleScroll}
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {currentInstance.displayType === 'simplified'
                                        ? 'Key Facts (extracted from Original Text)'
                                        : 'Key Facts (extracted from Simplified Text)'}
                                </CardTitle>
                            </CardHeader>

                            <CardContent>
                                {currentInstance.keyFacts.map((fact, idx) => (
                                    <div key={idx} className="mb-4">
                                        <div
                                            ref={el => (factRefs.current[idx] = el)}
                                            className={
                                                "p-3 bg-gray-50 rounded-lg flex justify-between items-center " +
                                                (selectedFactIndex === idx ? 'ring-2 ring-blue-500' : '')
                                            }
                                        >
                                            <span>{fact}</span>

                                            <div className="flex items-center gap-2">
                                                {hasConn(idx) ? (
                                                    <Check className="text-green-500" />
                                                ) : (
                                                    <X className="text-red-500" />
                                                )}

                                                <div
                                                    className="w-4 h-4 bg-gray-300 rounded-full cursor-pointer hover:bg-gray-400"
                                                    onClick={() =>
                                                        setSelectedFactIndex(
                                                            selectedFactIndex === idx ? null : idx
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>

                                        {hasConn(idx) ? (
                                            <div className="flex gap-2 justify-end px-2">
                                                <span className="text-green-600 font-bold">
                                                    Connected
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 justify-end px-2">
                                                {currentInstance.displayType === 'simplified' ? (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={`${annotationStatus[currentInstance.id]?.[idx] === 'Wrong Key Fact'
                                                                ? 'bg-red-100'
                                                                : ''
                                                                } text-red-600 hover:text-red-700`}
                                                            onClick={() => handleAnnot(idx, 'Wrong Key Fact')}
                                                        >
                                                            Wrong Key Fact
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={`${annotationStatus[currentInstance.id]?.[idx] === 'good deletion'
                                                                ? 'bg-green-100'
                                                                : ''
                                                                } text-green-600 hover:text-green-700`}
                                                            onClick={() => handleAnnot(idx, 'good deletion')}
                                                        >
                                                            Good Deletion
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={`${annotationStatus[currentInstance.id]?.[idx] === 'bad deletion'
                                                                ? 'bg-red-100'
                                                                : ''
                                                                } text-red-600 hover:text-red-700`}
                                                            onClick={() => handleAnnot(idx, 'bad deletion')}
                                                        >
                                                            Bad Deletion
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={`${annotationStatus[currentInstance.id]?.[idx] === 'Wrong Key Fact'
                                                                ? 'bg-red-100'
                                                                : ''
                                                                } text-red-600 hover:text-red-700`}
                                                            onClick={() => handleAnnot(idx, 'Wrong Key Fact')}
                                                        >
                                                            Wrong Key Fact
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={`${annotationStatus[currentInstance.id]?.[idx] === 'elaboration'
                                                                ? 'bg-green-100'
                                                                : ''
                                                                } text-green-600 hover:text-green-700`}
                                                            onClick={() => handleAnnot(idx, 'elaboration')}
                                                        >
                                                            Elaboration
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={`${annotationStatus[currentInstance.id]?.[idx] === 'factual error'
                                                                ? 'bg-red-100'
                                                                : ''
                                                                } text-red-600 hover:text-red-700`}
                                                            onClick={() => handleAnnot(idx, 'factual error')}
                                                        >
                                                            Factual Error
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sentences */}
                    <div
                        ref={linePaneRef}
                        className="max-h-[60vh] overflow-y-auto pr-4"
                        onScroll={handleScroll}
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {currentInstance.displayType === 'simplified'
                                        ? 'Simplified Text Split into Sentences'
                                        : 'Original Text Split into Sentences'}
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="space-y-1">
                                {summaryLines.map(line => (
                                    <div
                                        key={line.number}
                                        ref={el => (lineRefs.current[line.number] = el)}
                                        className="flex gap-2 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                                        onClick={() => handleLineClick(line.number)}
                                    >
                                        <span className="font-mono w-8">[{line.number}]</span>
                                        <span>{line.text}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* SVG Arrows */}
                    <svg
                        ref={svgRef}
                        className="absolute inset-0 pointer-events-none"
                        width={svgSize.w}
                        height={svgSize.h}
                    >
                        <defs>
                            <marker
                                id="arrowhead"
                                markerWidth="10"
                                markerHeight="7"
                                refX="9"
                                refY="3.5"
                                orient="auto"
                            >
                                <polygon points="0 0,10 3.5,0 7" fill="#666" />
                            </marker>
                        </defs>

                        {void scrollVersion}

                        {connections[currentInstance.id]?.map((c, i) => {
                            const fEl = factRefs.current[c.factIndex];
                            const lEl = lineRefs.current[c.lineNumber];
                            const container = panelsRef.current;

                            if (!fEl || !lEl || !container) return null;

                            const fR = fEl.getBoundingClientRect();
                            const lR = lEl.getBoundingClientRect();
                            const cR = container.getBoundingClientRect();

                            const startX = fR.left + fR.width / 2 - cR.left;
                            const startY = fR.top + fR.height / 2 - cR.top;
                            const endX = lR.left - cR.left;
                            const endY = lR.top + lR.height / 2 - cR.top;

                            return (
                                <path
                                    key={i}
                                    d={`M ${startX} ${startY} L ${endX} ${endY}`}
                                    stroke={`hsl(${(c.factIndex * 137.5) % 360},65%,55%)`}
                                    strokeWidth={2}
                                    fill="none"
                                    markerEnd="url(#arrowhead)"
                                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                                    onClick={e => {
                                        e.stopPropagation();
                                        removeConn(i);
                                    }}
                                />
                            );
                        })}
                    </svg>
                </div>

                {/* Comments */}
                <div className="mt-3">
                    <Label>
                        <strong>Comments</strong>
                    </Label>

                    <Textarea
                        className="mt-1"
                        value={instanceComments[currentInstance.id] || ''}
                        onChange={e =>
                            setInstanceComments(p => ({
                                ...p,
                                [currentInstance.id]: e.target.value,
                            }))
                        }
                    />
                </div>

                {submitMessage && (
                    <div
                        className={`mt-3 p-4 flex items-center gap-2 rounded ${submitMessageType === 'error'
                            ? 'bg-red-50 text-red-800'
                            : 'bg-green-50 text-green-800'
                            }`}
                    >
                        {submitMessageType === 'error' ? (
                            <CircleX className="w-6 h-6" />
                        ) : (
                            <CircleCheckBig className="w-6 h-6" />
                        )}

                        <span>{submitMessage}</span>
                    </div>
                )}

                {/* Raw Saved Preview */}
                {annotations[currentInstance.id] && (
                    <Card className="mt-4">
                        <CardHeader>
                            <CardTitle>Saved Annotations (current instance)</CardTitle>
                        </CardHeader>

                        <CardContent>
                            <pre className="bg-gray-50 p-4 rounded whitespace-pre-wrap">
                                {JSON.stringify(
                                    {
                                        keyFacts: annotations[currentInstance.id],
                                        comment: instanceComments[currentInstance.id] || "",
                                        [
                                            currentInstance.displayType === "simplified"
                                                ? "completeness"
                                                : "faithfulness"
                                        ]:
                                            currentInstance.displayType === "simplified"
                                                ? completenessScores[currentInstance.id] ?? 0
                                                : faithfulnessScores[currentInstance.id] ?? 0,
                                    },
                                    null,
                                    2
                                )}
                            </pre>
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    }
);

FactCheckerUI.displayName = 'FactCheckerUI';

/* ================================
   Main App Component
================================ */

const App = () => {
    const [fileData, setFileData] = useState<AnnotationFile | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const factCheckerRef = useRef<FactCheckerUIHandle | null>(null);

    const buildStateFromResults = (parsed: any): AnnotationState | undefined => {
        if (!parsed.results || !Array.isArray(parsed.results)) return undefined;

        const state: AnnotationState = {
            connections: {},
            annotationStatus: {},
            instanceComments: {},
            completenessScores: {},
            faithfulnessScores: {},
            currentInstanceIndex: 0,
        };

        parsed.results.forEach((result: any) => {
            const id = result.instanceId;
            if (!id) return;

            state.connections[id] = [];
            state.annotationStatus[id] = {};

            if (result.comment) {
                state.instanceComments[id] = result.comment;
            }

            if (typeof result.completeness === 'number') {
                state.completenessScores[id] = result.completeness;
            }

            if (typeof result.faithfulness === 'number') {
                state.faithfulnessScores[id] = result.faithfulness;
            }

            const keyFacts = result.keyFacts || [];

            keyFacts.forEach((ann: any, factIndex: number) => {
                const operation = ann.Operation || '';

                if (operation === 'Connected') {
                    const lineNumbers = ann['line number'] || [];

                    lineNumbers.forEach((lineNumber: number) => {
                        state.connections[id].push({
                            factIndex,
                            lineNumber,
                            start: { x: 0, y: 0 },
                            end: { x: 0, y: 0 },
                        });
                    });
                } else if (operation) {
                    state.annotationStatus[id][factIndex] = operation;
                }
            });
        });

        return state;
    };

    const normalizeInstances = (instances: Instance[]) => {
        return instances.map(inst => ({
            ...inst,
            orginal: inst.orginal || inst.original || '',
        }));
    };

    const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];

        if (!file) return;

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);

            if (!parsed.instances || !Array.isArray(parsed.instances)) {
                setLoadError('Invalid file: must contain "instances".');
                return;
            }

            const normalizedInstances = normalizeInstances(parsed.instances);
            const stateFromResults = buildStateFromResults(parsed);

            const state: AnnotationState | undefined = parsed.state
                ? {
                    connections: {
                        ...(stateFromResults?.connections || {}),
                        ...(parsed.state.connections || {}),
                    },
                    annotationStatus: {
                        ...(stateFromResults?.annotationStatus || {}),
                        ...(parsed.state.annotationStatus || {}),
                    },
                    instanceComments: {
                        ...(stateFromResults?.instanceComments || {}),
                        ...(parsed.state.instanceComments || {}),
                    },
                    completenessScores: {
                        ...(stateFromResults?.completenessScores || {}),
                        ...(parsed.state.completenessScores || {}),
                    },
                    faithfulnessScores: {
                        ...(stateFromResults?.faithfulnessScores || {}),
                        ...(parsed.state.faithfulnessScores || {}),
                    },
                    currentInstanceIndex: Math.min(
                        parsed.state.currentInstanceIndex ?? 0,
                        Math.max(normalizedInstances.length - 1, 0)
                    ),
                }
                : stateFromResults;

            setFileData({
                instances: normalizedInstances,
                state,
                results: parsed.results,
            });

            setLoadError(null);
        } catch (err) {
            console.error(err);
            setLoadError('Could not parse JSON file. Please check the format.');
        } finally {
            e.target.value = '';
        }
    };

    const handleBackToUpload = () => {
        setFileData(null);
        setLoadError(null);
    };

    const handleSaveDownload = async () => {
        await factCheckerRef.current?.downloadAll();
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
            {!fileData ? (
                <Card className="w-full max-w-6xl mb-6">
                    <CardHeader>
                        <CardTitle>
                            M<sup>2</sup>PRESERVE Annotation Interface
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <p className="text-sm text-gray-700">
                                    Upload a JSON file containing <code>instances</code>.
                                </p>

                                <p className="text-sm text-gray-500">
                                    If you previously downloaded annotations from this app, you can
                                    upload the same file to continue where you left off.
                                </p>
                            </div>

                            <div>
                                <input
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={handleFileUpload}
                                    className="block text-sm"
                                />
                            </div>
                        </div>

                        {loadError && (
                            <p className="text-sm text-red-600 mt-2">{loadError}</p>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="w-full max-w-6xl mb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold">
                            M<sup>2</sup>PRESERVE Annotation Interface
                        </h1>
                        <p className="text-sm text-gray-500">
                            Loaded instances: <strong>{fileData.instances.length}</strong>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={handleSaveDownload}
                            className="bg-green-600 text-white"
                        >
                            Save / Download
                        </Button>

                        <Button
                            variant="outline"
                            onClick={handleBackToUpload}
                        >
                            Upload another file / Reset
                        </Button>
                    </div>
                </div>
            )}

            {fileData ? (
                <FactCheckerUI
                    ref={factCheckerRef}
                    instances={fileData.instances}
                    initialState={fileData.state}
                />
            ) : (
                <p className="text-gray-600 mt-10">
                    No file loaded yet. Please upload an annotation file to begin.
                </p>
            )}
        </div>
    );
};

export default App;