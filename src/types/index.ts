export interface GameSettingsType {
  highlightRowAndColumn: boolean;
  highlightSameNumbers: boolean;
  highlightSameHints: boolean;
  highlightCrossForNumbers: boolean;
  highlightCrossForHints: boolean;
  hideImpossibleValuesInSelector: boolean;
  hideImpossibleValuesInHints: boolean;
  highlightCurrentQuadrant: boolean;
  highlightQuadrantsWithSameNumber: boolean;
  highlightAllObviousCells: boolean;
  highlightObviousCellsForCurrentNumber: boolean;
  undoMoves: boolean;
  highlightConflicts: boolean;
  countMistakes: boolean;
}
