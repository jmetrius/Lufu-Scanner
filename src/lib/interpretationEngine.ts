export interface ExtractedParameter {
  parameter: string;
  value: number | null;
  predicted: number | null;
  percentPredicted: number | null;
  unit: string;
}

export function generateInterpretation(parameters: ExtractedParameter[]): string {
  const getParam = (names: string[]) => {
    return parameters.find(p => 
      names.some(n => p.parameter.toLowerCase().replace(/\s/g, '') === n.toLowerCase().replace(/\s/g, ''))
    );
  };

  const tlc = getParam(['TLC', 'TLC_SB']);
  const fev1fvc = getParam(['FEV1%FVC', 'FEV1/FVC', 'Tiffeneau', 'FEV1%']);
  const fev1vc = getParam(['FEV1%I', 'FEV1%VC', 'FEV1/VC', 'FEV1%VCIN']);
  const fev1 = getParam(['FEV1']);
  const dlco = getParam(['DLCO', 'DLCO_SB', 'DLCOcSB']);
  const kco = getParam(['KCO', 'KCO_SB']);
  const rtot = getParam(['Rtot', 'sRtot']);
  const rv = getParam(['RV', 'RV_SB']);
  const mef75 = getParam(['MEF75', 'MEF 75']);
  const mef50 = getParam(['MEF50', 'MEF 50']);
  const mef25 = getParam(['MEF25', 'MEF 25']);

  let isObstructive = false;
  let isRestrictive = false;
  let findings: string[] = [];

  // 1. Restriktion: TLC < 80%
  if (tlc && tlc.percentPredicted !== null && tlc.percentPredicted < 80) {
    isRestrictive = true;
  }

  // 2. Obstruktion: FEV1/FVC < 70% oder FEV1/VC < 70% (absoluter Wert)
  let ratioValue = fev1fvc?.value || fev1vc?.value;
  if (ratioValue !== undefined && ratioValue !== null && ratioValue < 70) {
    isObstructive = true;
  } else if (fev1 && fev1.percentPredicted !== null && fev1.percentPredicted < 80 && rtot && rtot.percentPredicted !== null && rtot.percentPredicted > 120) {
    // Alternative Indikation für Obstruktion
    isObstructive = true;
  }

  // 3. Diffusion
  let isDiffusionReduced = false;
  if (dlco && dlco.percentPredicted !== null && dlco.percentPredicted < 80) {
    isDiffusionReduced = true;
  }

  // 4. Überblähung
  let isHyperinflated = false;
  if (rv && rv.percentPredicted !== null && rv.percentPredicted > 120) {
    isHyperinflated = true;
  }

  // Zusammenfassung der Ventilationsstörung
  if (isObstructive && isRestrictive) {
    findings.push("Es zeigt sich ein gemischt obstruktiv-restriktives Ventilationsmuster.");
  } else if (isObstructive) {
    findings.push("Es zeigt sich ein obstruktives Ventilationsmuster.");
  } else if (isRestrictive) {
    findings.push("Es zeigt sich ein restriktives Ventilationsmuster.");
  } else {
    findings.push("Die gemessenen Lungenvolumina und Flussparameter liegen weitgehend im Normbereich (kein eindeutiger Hinweis auf eine Obstruktion oder Restriktion).");
  }

  // Schweregrad der Obstruktion
  if (isObstructive && fev1 && fev1.percentPredicted !== null) {
    if (fev1.percentPredicted >= 70) findings.push("Die Obstruktion ist leichtgradig (FEV1 ≥ 70% d.S.).");
    else if (fev1.percentPredicted >= 50) findings.push("Die Obstruktion ist mittelgradig (FEV1 50-69% d.S.).");
    else if (fev1.percentPredicted >= 30) findings.push("Die Obstruktion ist schwergradig (FEV1 30-49% d.S.).");
    else findings.push("Die Obstruktion ist sehr schwergradig (FEV1 < 30% d.S.).");
  }

  // Atemwegswiderstand (Rtot)
  if (rtot && rtot.percentPredicted !== null) {
    if (rtot.percentPredicted > 120) {
      findings.push("Der Atemwegswiderstand (Rtot) ist erhöht, was eine Obstruktion der Atemwege bestätigt.");
    }
  }

  // Periphere Obstruktion (MEF)
  const isMefReduced = (mef50 && mef50.percentPredicted !== null && mef50.percentPredicted < 70) || 
                       (mef25 && mef25.percentPredicted !== null && mef25.percentPredicted < 70);
  
  if (isMefReduced) {
    if (!isObstructive) {
      findings.push("Die verminderten mittleren und endexspiratorischen Flüsse (MEF50/MEF25) weisen auf eine isolierte periphere Obstruktion (Small-Airway-Disease) hin, auch wenn die globale Tiffeneau-Ratio noch normwertig ist.");
    } else {
      findings.push("Die deutlich verminderten exspiratorischen Flüsse (MEF) unterstreichen die Obstruktion, insbesondere im Bereich der kleinen Atemwege.");
    }
  }

  // Hyperinflation
  if (isHyperinflated) {
    findings.push("Ein erhöhtes Residualvolumen (RV) weist auf eine Lungenüberblähung (Hyperinflation/Air-Trapping) hin.");
  }

  // Diffusion (DLCO vs KCO)
  if (isDiffusionReduced) {
    if (kco && kco.percentPredicted !== null) {
      if (kco.percentPredicted >= 80) {
        findings.push("Die Diffusionskapazität (DLCO) ist vermindert, der Transferkoeffizient (KCO) liegt jedoch im Normbereich. Dies spricht gegen einen primären Parenchymschaden und eher für ein reduziertes Alveolarvolumen (z.B. bei Restriktion oder inkompletter Inspiration).");
      } else {
        findings.push("Sowohl die Diffusionskapazität (DLCO) als auch der Transferkoeffizient (KCO) sind vermindert. Dies deutet auf eine strukturelle Gasaustauschstörung hin (z.B. Emphysem, interstitielle Lungenerkrankung oder pulmonalvaskuläre Erkrankung).");
      }
    } else {
      findings.push("Die Diffusionskapazität (DLCO) ist signifikant vermindert, was auf eine Gasaustauschstörung hindeutet.");
    }
  } else if (dlco && dlco.percentPredicted !== null && dlco.percentPredicted >= 80) {
    findings.push("Die Diffusionskapazität (DLCO) ist unauffällig.");
  }

  let report = findings.join(" ");

  report += "\n\n⚠️ WICHTIGER HINWEIS: Diese Interpretation ist vorläufig, maschinell erstellt und dient ausschließlich zu Informationszwecken. Sie ersetzt keine fachärztliche Diagnose oder klinische Beurteilung.";

  return report;
}
