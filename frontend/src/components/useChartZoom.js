import { useEffect, useRef, useState } from "react";
import { FULL_VIEW, panDelta, panView, timeFractionAt, zoomView } from "./chartGeometry.js";

const WHEEL_SPEED = 0.0015;

// Wheel zoom (anchored under the pointer) and click-and-drag panning for a chart's <svg>.
// The view is owned by the caller so that several charts can share it.
// Spread the returned props on the <svg>.
export function useChartZoom(view = FULL_VIEW, onViewChange = () => {}) {
  const [node, setNode] = useState(null);
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const changeRef = useRef(onViewChange);
  const drag = useRef(null);
  viewRef.current = view;
  changeRef.current = onViewChange;

  // A native listener is needed: React's onWheel is passive and cannot cancel the page scroll.
  useEffect(() => {
    if (!node) return undefined;
    const onWheel = (e) => {
      const current = viewRef.current;
      e.preventDefault();
      const anchor = timeFractionAt(e.clientX, node.getBoundingClientRect(), current);
      changeRef.current(zoomView(current, Math.exp(e.deltaY * WHEEL_SPEED), anchor));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [node]);

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  return {
    ref: setNode,
    className: `chart chart-zoomable${dragging ? " dragging" : ""}`,
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, view: viewRef.current };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    onPointerMove: (e) => {
      if (!drag.current) return;
      const { x, view: start } = drag.current;
      const delta = panDelta(e.clientX - x, e.currentTarget.getBoundingClientRect(), start);
      changeRef.current(panView(start, delta));
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
