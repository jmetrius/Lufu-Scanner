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
  const [extractedData, setExtractedData] = useState<ExtractedParameter[]>([]);
  const [interpretation, setInterpretation] = useState<string>("");
  const [aiInterpretation, setAiInterpretation] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        model: 'gemini-3.1-pro-preview',
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
        const parsedResult = JSON.parse(response.text);
        setExtractedData(parsedResult.extractedData || []);
      } else {
        throw new Error("Keine Antwort vom Modell erhalten.");
      }
    } catch (err) {
      console.error("Fehler bei der Analyse:", err);
      setError("Es gab einen Fehler bei der Analyse des Bildes. Bitte versuchen Sie es erneut.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const requestAiInterpretation = async () => {
    setIsAiAnalyzing(true);
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
        setAiInterpretation(response.text);
      }
    } catch (err) {
      console.error("Fehler bei der KI-Tiefenanalyse:", err);
      setError("Fehler bei der KI-Analyse. Bitte versuchen Sie es später erneut.");
    } finally {
      setIsAiAnalyzing(false);
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600">
            <Activity className="w-6 h-6" />
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">LuFu Analysator</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Input & Image Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <Camera className="w-5 h-5 text-slate-500" />
                Befund hochladen
              </h2>
              
              {!imageSrc ? (
                <div className="space-y-4">
                  <div 
                    className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
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
                    />
                  </div>
                  
                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">oder</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <button 
                    onClick={handleManualEntry}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-3 px-4 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    Manuelle Eingabe
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[3/4] flex items-center justify-center">
                    <img src={imageSrc} alt="Hochgeladener Befund" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <ImageIcon className="w-4 h-4" />
                      Neues Bild
                    </button>
                    <button 
                      onClick={handleManualEntry}
                      className="flex-1 bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
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
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7 space-y-6">
            {isAnalyzing && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">Befund wird analysiert...</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Die KI liest die Daten aus dem Bild aus. Dies kann einige Sekunden dauern.
                </p>
              </div>
            )}

            {error && !isAnalyzing && (
              <div className="bg-red-50 rounded-2xl border border-red-200 p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800 mb-1">Fehler</h3>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              </div>
            )}

            {!isAnalyzing && extractedData.length === 0 && !imageSrc && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px] text-slate-500">
                <FileText className="w-12 h-12 text-slate-300 mb-4" />
                <p className="text-base">Laden Sie ein Bild hoch oder wählen Sie die manuelle Eingabe, um die Analyse zu starten.</p>
              </div>
            )}

            {!isAnalyzing && extractedData.length > 0 && (
              <div className="space-y-6">
                {/* Interpretation Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      <h2 className="text-base font-medium text-blue-900">Interpretation (Engine)</h2>
                    </div>
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                      title="Als Text kopieren"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Kopiert" : "Kopieren"}
                    </button>
                  </div>
                  <div className="p-6">
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {interpretation}
                    </p>

                    {/* AI Interpretation Section */}
                    <div className="mt-6 border-t border-slate-100 pt-6">
                      {!aiInterpretation && !isAiAnalyzing && (
                        <button 
                          onClick={requestAiInterpretation} 
                          className="flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-4 py-2.5 rounded-xl transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          Erweiterte KI-Tiefenanalyse anfordern
                        </button>
                      )}
                      
                      {isAiAnalyzing && (
                        <div className="flex items-center gap-3 text-sm text-purple-700 bg-purple-50 border border-purple-100 px-4 py-3 rounded-xl">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          KI analysiert Daten im Detail...
                        </div>
                      )}
                      
                      {aiInterpretation && (
                        <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-xl p-6">
                          <h3 className="text-sm font-semibold text-purple-900 mb-4 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            KI-Tiefenanalyse
                          </h3>
                          <div className="text-sm text-slate-700 leading-relaxed [&>p]:mb-4 last:[&>p]:mb-0 [&>h1]:text-lg [&>h1]:font-semibold [&>h1]:mb-3 [&>h1]:text-purple-900 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mb-2 [&>h2]:text-purple-900 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-2 [&>h3]:text-purple-900 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4 [&>li]:mb-1 [&>strong]:font-semibold [&>strong]:text-purple-900">
                            <Markdown>{aiInterpretation}</Markdown>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Extracted Data Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-base font-medium text-slate-900">Messwerte</h2>
                    <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                      Editierbar
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
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
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={item.unit || ''}
                                onChange={(e) => handleDataChange(index, 'unit', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 py-1 outline-none transition-colors text-slate-500"
                                placeholder="-"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button 
                                onClick={() => handleDeleteRow(index)}
                                className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                title="Zeile löschen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center">
                    <button 
                      onClick={handleAddRow}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
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
