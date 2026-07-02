// MediaEditor/useDrawingState.ts
import { useState } from 'react';

export const useDrawingState = () => {
  const [strokes, setStrokes] = useState<any[]>([]);
  const [currentStroke, setCurrentStroke] = useState<any>(null);
  const [currentPoints, setCurrentPoints] = useState<any[]>([]);
  const [strokeHistory, setStrokeHistory] = useState<any[]>([]);

  const addStroke = (stroke: any) => {
    setStrokes(prev => [...prev, stroke]);
    setStrokeHistory(prev => [...prev, strokes]);
  };

  const clear = () => {
    setStrokes([]);
    setCurrentStroke(null);
    setCurrentPoints([]);
    setStrokeHistory([]);
  };

  const undo = () => {
    if (strokeHistory.length > 0) {
      const previousState = strokeHistory[strokeHistory.length - 1];
      setStrokes(previousState);
      setStrokeHistory(prev => prev.slice(0, -1));
    }
  };

  const redoStroke = () => {
    // Implementation depends on how you track redo history
  };

  const loadStrokes = (newStrokes: any[]) => {
    setStrokes(newStrokes);
  };

  return {
    strokes,
    currentStroke,
    currentPoints,
    addStroke,
    clear,
    undo,
    redoStroke,
    loadStrokes,
  };
};