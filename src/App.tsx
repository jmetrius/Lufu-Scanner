import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, FileText, Activity, AlertCircle, Loader2, Image as ImageIcon, Plus, Trash2, Edit3, Sparkles, Copy, Check } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { ExtractedParameter, generateInterpretation } from './lib/interpretationEngine';
import Markdown from 'react-markdown';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [extractedData, setExtractedData] = useState<ExtractedParameter[]>([]);
  const [interpretation, setInterpretation] = useState<string>("");
  const [aiInterpretation, setAiInterpretation] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [error, setError] = useState<{title: string, message: string} | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      setProgress(5);
      setAnalysisPhase("Bild wird vorbereitet...");
      
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 30) {
            setAnalysisPhase("KI-Modell wird geladen...");
            return prev + 2;
          }
          if (prev < 70) {
            setAnalysisPhase("Lungenfunktion-Daten werden extrahiert...");
            return prev + 1;
          }
          if (prev < 90) {
            setAnalysisPhase("Messwerte werden verarbeitet...");
            return prev + 0.5;
          }
          return prev;
        });
      }, 200);
    } else {
      setProgress(0);
      setAnalysisPhase("");
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    let interval: any;
    if (isAiAnalyzing) {
      setAiProgress(10);
      interval = setInterval(() => {
        setAiProgress(prev => prev < 95 ? prev + 2 : prev);
      }, 300);
    } else {
      setAiProgress(0);
    }
    return () => clearInterval(interval);
  }, [isAiAnalyzing]);

  useEffect(() => {
    if (extractedData.length > 0) {
      setInterpretation(generateInterpretation(extractedData));
    } else {
      setInterpretation("");
    }
  }, [extractedData]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError({
          title: "Datei zu groß",
          message: "Das Bild überschreitet das Limit von 10 MB. Bitte verwenden Sie ein kleineres Bild."
        });
        return;
      }
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setImageSrc(base64String);
      analyzeImage(base64String);
    };
    reader.onerror = () => {
      setError({
        title: "Dateifehler",
        message: "Die Datei konnte nicht gelesen werden. Bitte versuchen Sie es mit einem anderen Bild."
      });
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    setError(null);
    setExtractedData([]);
    setAiInterpretation(null);

    try {
      const base64Data = base64Image.split(',')[1];
      const mimeType = base64Image.split(';')[0].split(':')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          "Analysiere dieses Bild eines Bodyplethysmographie-Befunds (Lungenfunktion + Diffusion). Extrahiere die folgenden Parameter (falls vorhanden): VC IN, FVC, FEV1, FEV1%I, FEV1%FVC, PEF, MEF75, MEF50, MEF25, ERV, FRCpl, RV, TLC, RV%TLC, Rtot, sRtot, VC, DLCO_SB, KCO_SB, TLC_SB, RV%TLC_SB, RV_SB, Hb, DLCOcSB. Gib für jeden gefundenen Parameter den gemessenen Wert (value), den Sollwert (predicted) und den Prozent-Sollwert (percentPredicted) an. Wenn ein Wert nicht vorhanden ist, lass ihn weg oder setze ihn auf null."
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extractedData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    parameter: { type: Type.STRING, description: "Name des Parameters" },
                    value: { type: Type.NUMBER, description: "Gemessener Wert (Ist-Wert)" },
                    predicted: { type: Type.NUMBER, description: "Sollwert (Predicted)" },
                    percentPredicted: { type: Type.NUMBER, description: "Prozent vom Sollwert (% Soll)" },
                    unit: { type: Type.STRING, description: "Maßeinheit" }
                  },
                  required: ["parameter"]
                }
              }
            },
            required: ["extractedData"]
          }
        }
      });

      if (response.text) {
        setProgress(100);
        setAnalysisPhase("Analyse abgeschlossen");
        const parsedResult = JSON.parse(response.text);
        if (!parsedResult.extractedData || parsedResult.extractedData.length === 0) {
          setError({
            title: "Keine Daten gefunden",
            message: "Im Bild konnten keine relevanten Lungenfunktions-Parameter erkannt werden. Bitte achten Sie auf eine gute Beleuchtung und Schärfe des Fotos."
          });
        } else {
          setExtractedData(parsedResult.extractedData);
        }
      } else {
        throw new Error("Keine Antwort vom Modell erhalten.");
      }
    } catch (err: any) {
      console.error("Fehler bei der Analyse:", err);
      let message = "Die Analyse konnte nicht durchgeführt werden. Bitte prüfen Sie Ihre Internetverbindung oder versuchen Sie es mit einer klareren Aufnahme.";
      if (err?.message?.includes("quota")) {
        message = "Das Kontingent für die KI-Analyse ist aktuell erschöpft. Bitte versuchen Sie es in Kürze erneut.";
      }
      setError({
        title: "Analyse fehlgeschlagen",
        message
      });
    } finally {
      setTimeout(() => setIsAnalyzing(false), 500);
    }
  };

  const requestAiInterpretation = async () => {
    setIsAiAnalyzing(true);
    setError(null);
    try {
      const validData = extractedData.filter(d => d.value !== null);
      const dataString = validData.map(d => 
        `- ${d.parameter}: Ist: ${d.value} ${d.unit}, Soll: ${d.predicted !== null ? d.predicted : '-'}, %Soll: ${d.percentPredicted !== null ? d.percentPredicted + '%' : '-'}`
      ).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Du bist ein erfahrener Pneumologe. Erstelle eine ausführliche, tiefgehende medizinische Interpretation der folgenden Bodyplethysmographie- und Diffusionsdaten auf Deutsch. Gehe auf mögliche Differenzialdiagnosen ein, erkläre die Zusammenhänge der Parameter und gib falls sinnvoll klinische Empfehlungen. Weise am Ende darauf hin, dass dies eine KI-generierte Analyse ist und keinen Arztbesuch ersetzt.\n\nPatientendaten:\n${dataString}`,
      });

      if (response.text) {
        setAiProgress(100);
        setAiInterpretation(response.text);
      }
    } catch (err) {
      console.error("Fehler bei der KI-Tiefenanalyse:", err);
      setError({
        title: "KI-Analyse unterbrochen",
        message: "Die detaillierte KI-Interpretation konnte nicht generiert werden. Bitte versuchen Sie es noch einmal."
      });
    } finally {
      setTimeout(() => setIsAiAnalyzing(false), 300);
    }
  };

  const handleManualEntry = () => {
    const defaultParams = [
      "VC IN", "FVC", "FEV1", "FEV1%FVC", "PEF", "MEF75", "MEF50", "MEF25",
      "TLC", "RV", "RV%TLC", "Rtot", "DLCO_SB", "KCO_SB"
    ];
    const initialData: ExtractedParameter[] = defaultParams.map(p => ({
      parameter: p,
      value: null,
      predicted: null,
      percentPredicted: null,
      unit: ""
    }));
    setExtractedData(initialData);
    setImageSrc(null);
    setError(null);
    setAiInterpretation(null);
  };

  const handleDataChange = (index: number, field: keyof ExtractedParameter, value: string) => {
    const newData = [...extractedData];
    const numValue = value === '' ? null : Number(value);
    
    if (field === 'parameter' || field === 'unit') {
      newData[index] = { ...newData[index], [field]: value };
    } else {
      newData[index] = { ...newData[index], [field]: numValue };
    }
    
    setExtractedData(newData);
  };

  const handleAddRow = () => {
    setExtractedData([...extractedData, { parameter: "", value: null, predicted: null, percentPredicted: null, unit: "" }]);
  };

  const handleDeleteRow = (index: number) => {
    const newData = [...extractedData];
    newData.splice(index, 1);
    setExtractedData(newData);
  };

  const copyToClipboard = () => {
    const getP = (names: string[]) => {
      const p = extractedData.find(d => names.some(n => d.parameter.toLowerCase().replace(/\s/g, '') === n.toLowerCase().replace(/\s/g, '')));
      if (!p || p.value === null) return "-";
      return `${p.value} ${p.unit} (${p.percentPredicted !== null ? p.percentPredicted + '%' : '-'})`;
    };

    const text = [
      `VC: ${getP(['VC', 'VC IN'])}`,
      `FVC: ${getP(['FVC'])}`,
      `FEV1: ${getP(['FEV1'])}`,
      `Tiffenau: ${getP(['FEV1%FVC', 'FEV1/FVC', 'Tiffeneau', 'FEV1%', 'FEV1%I', 'FEV1%VC'])}`,
      `RV: ${getP(['RV', 'RV_SB'])}`,
      `TLC: ${getP(['TLC', 'TLC_SB'])}`,
      `Rtot: ${getP(['Rtot', 'sRtot'])}`,
      `DLCO_SB: ${getP(['DLCO_SB', 'DLCO', 'DLCOcSB'])}`,
      `KCO_SB: ${getP(['KCO_SB', 'KCO'])}`,
      "",
      `Beurteilung: ${interpretation.split('\n\n⚠️')[0]}` // Strip disclaimer for cleaner copy if needed, or keep it. User asked for "Beurteilung:"
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10" id="main-header">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600" id="brand-logo">
            <Activity className="w-6 h-6" />
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">LuFu Analysator</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Input & Image Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6" id="upload-card">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2" id="upload-title">
                <Camera className="w-5 h-5 text-slate-500" />
                Befund hochladen
              </h2>
              
              {!imageSrc ? (
                <div className="space-y-4" id="upload-options">
                  <div 
                    className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    id="dropzone"
                  >
                    <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700 mb-1">Klicken Sie hier, um ein Bild auszuwählen</p>
                    <p className="text-xs text-slate-500">PNG, JPG oder WEBP (max. 10MB)</p>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                      id="file-input"
                    />
                  </div>
                  
                  <div className="relative flex items-center py-2" id="separator">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">oder</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <button 
                    onClick={handleManualEntry}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-3 px-4 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    id="manual-entry-btn"
                  >
                    <Edit3 className="w-4 h-4" />
                    Manuelle Eingabe
                  </button>
                </div>
              ) : (
                <div className="space-y-4" id="preview-section">
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[3/4] flex items-center justify-center" id="image-preview-container">
                    <img src={imageSrc} alt="Hochgeladener Befund" className="max-w-full max-h-full object-contain" id="preview-image" />
                  </div>
                  <div className="flex gap-3" id="preview-actions">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                      id="retake-image-btn"
                    >
                      <ImageIcon className="w-4 h-4" />
                      Neues Bild
                    </button>
                    <button 
                      onClick={handleManualEntry}
                      className="flex-1 bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                      id="manual-switch-btn"
                    >
                      <Edit3 className="w-4 h-4" />
                      Manuell
                    </button>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                    id="file-input-alt"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7 space-y-6">
            {isAnalyzing && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center justify-center text-center h-full min-h-[400px]" id="analyzing-loader">
                <div className="relative mb-8">
                  <div className="w-20 h-20 border-4 border-slate-100 rounded-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-900">{Math.round(progress)}%</span>
                  </div>
                </div>
                
                <h3 className="text-lg font-medium text-slate-900 mb-2">{analysisPhase}</h3>
                <p className="text-sm text-slate-500 max-w-sm mb-8">
                  Die KI liest die Daten aus dem Bild aus. Bitte lassen Sie das Fenster geöffnet.
                </p>
                
                <div className="w-full max-w-xs bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {error && !isAnalyzing && (
              <div className="bg-red-50 rounded-2xl border border-red-200 p-6 flex items-start gap-3" id="error-message">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-red-800 mb-1">{error.title}</h3>
                  <p className="text-sm text-red-700 leading-relaxed">{error.message}</p>
                  <button 
                    onClick={() => setError(null)}
                    className="mt-3 text-xs font-semibold text-red-800 hover:underline"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            )}

            {!isAnalyzing && extractedData.length === 0 && !imageSrc && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px] text-slate-500" id="empty-state">
                <FileText className="w-12 h-12 text-slate-300 mb-4" />
                <p className="text-base">Laden Sie ein Bild hoch oder wählen Sie die manuelle Eingabe, um die Analyse zu starten.</p>
              </div>
            )}

            {!isAnalyzing && extractedData.length > 0 && (
              <div className="space-y-6" id="results-container">
                {/* Interpretation Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" id="interpretation-card">
                  <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center justify-between" id="interpretation-header">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      <h2 className="text-base font-medium text-blue-900">Interpretation (Engine)</h2>
                    </div>
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                      title="Als Text kopieren"
                      id="copy-btn"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Kopiert" : "Kopieren"}
                    </button>
                  </div>
                  <div className="p-6" id="interpretation-content">
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap" id="main-interpretation-text">
                      {interpretation}
                    </p>

                    {/* AI Interpretation Section */}
                    <div className="mt-6 border-t border-slate-100 pt-6" id="ai-interpretation-section">
                      {!aiInterpretation && !isAiAnalyzing && (
                        <button 
                          onClick={requestAiInterpretation} 
                          className="flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-4 py-2.5 rounded-xl transition-colors"
                          id="request-ai-btn"
                        >
                          <Sparkles className="w-4 h-4" />
                          Erweiterte KI-Tiefenanalyse anfordern
                        </button>
                      )}
                      
                      {isAiAnalyzing && (
                        <div className="bg-purple-50 border border-purple-100 px-4 py-4 rounded-xl space-y-3" id="ai-analyzing-indicator">
                          <div className="flex items-center gap-3 text-sm text-purple-800 font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            KI analysiert Daten im Detail...
                          </div>
                          <div className="w-full bg-purple-100 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-purple-500 h-full transition-all duration-300"
                              style={{ width: `${aiProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      
                      {aiInterpretation && (
                        <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-xl p-6" id="ai-result-card">
                          <h3 className="text-sm font-semibold text-purple-900 mb-4 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            KI-Tiefenanalyse
                          </h3>
                          <div className="text-sm text-slate-700 leading-relaxed [&>p]:mb-4 last:[&>p]:mb-0 [&>h1]:text-lg [&>h1]:font-semibold [&>h1]:mb-3 [&>h1]:text-purple-900 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mb-2 [&>h2]:text-purple-900 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-2 [&>h3]:text-purple-900 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4 [&>li]:mb-1 [&>strong]:font-semibold [&>strong]:text-purple-900" id="ai-markdown-content">
                            <Markdown>{aiInterpretation}</Markdown>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Extracted Data Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" id="data-table-card">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between" id="data-table-header">
                    <h2 className="text-base font-medium text-slate-900">Messwerte</h2>
                    <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                      Editierbar
                    </span>
                  </div>
                  <div className="overflow-x-auto" id="table-scroll-container">
                    <table className="w-full text-sm text-left" id="data-table">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-medium">Parameter</th>
                          <th className="px-4 py-3 font-medium text-right w-24">Ist-Wert</th>
                          <th className="px-4 py-3 font-medium text-right w-24">Sollwert</th>
                          <th className="px-4 py-3 font-medium text-right w-24">% Soll</th>
                          <th className="px-4 py-3 font-medium w-20">Einheit</th>
                          <th className="px-2 py-3 font-medium w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {extractedData.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={item.parameter}
                                onChange={(e) => handleDataChange(index, 'parameter', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 py-1 outline-none transition-colors"
                                placeholder="Parameter"
                                id={`param-${index}`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={item.value !== null ? item.value : ''}
                                onChange={(e) => handleDataChange(index, 'value', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 py-1 outline-none transition-colors text-right tabular-nums"
                                placeholder="-"
                                step="any"
                                id={`value-${index}`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={item.predicted !== null ? item.predicted : ''}
                                onChange={(e) => handleDataChange(index, 'predicted', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 py-1 outline-none transition-colors text-right tabular-nums text-slate-500"
                                placeholder="-"
                                step="any"
                                id={`pred-${index}`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={item.percentPredicted !== null ? item.percentPredicted : ''}
                                onChange={(e) => handleDataChange(index, 'percentPredicted', e.target.value)}
                                className={`w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 py-1 outline-none transition-colors text-right tabular-nums font-medium ${
                                  item.percentPredicted !== null && item.percentPredicted < 80 ? 'text-red-600' : 
                                  item.percentPredicted !== null && item.percentPredicted > 120 ? 'text-orange-600' : 
                                  'text-emerald-600'
                                }`}
                                placeholder="-"
                                step="any"
                                id={`percent-${index}`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={item.unit || ''}
                                onChange={(e) => handleDataChange(index, 'unit', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 py-1 outline-none transition-colors text-slate-500"
                                placeholder="-"
                                id={`unit-${index}`}
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button 
                                onClick={() => handleDeleteRow(index)}
                                className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                title="Zeile löschen"
                                id={`delete-${index}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center" id="table-footer">
                    <button 
                      onClick={handleAddRow}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                      id="add-param-btn"
                    >
                      <Plus className="w-4 h-4" />
                      Parameter hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
