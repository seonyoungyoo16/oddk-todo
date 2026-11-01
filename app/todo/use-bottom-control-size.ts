"use client";
import { useLayoutEffect, type RefObject } from "react";

export function useBottomControlSize(ref: RefObject<HTMLElement | null>, property: string) {
  useLayoutEffect(() => {
    const element = ref.current, page = element?.closest<HTMLElement>(".oddk-page");
    if (!element || !page) return;
    const measure = () => page.style.setProperty(property, `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); page.style.removeProperty(property); };
  }, [ref, property]);
}
