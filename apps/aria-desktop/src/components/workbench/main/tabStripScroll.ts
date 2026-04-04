type TabStripWheelInput = {
  clientWidth: number;
  deltaX: number;
  deltaY: number;
  scrollWidth: number;
};

export function getTabStripScrollDelta({
  deltaX,
  deltaY
}: Pick<TabStripWheelInput, "deltaX" | "deltaY">) {
  return deltaX !== 0 ? deltaX : deltaY;
}

export function shouldHandleTabStripWheel({
  clientWidth,
  deltaX,
  deltaY,
  scrollWidth
}: TabStripWheelInput) {
  return scrollWidth > clientWidth && getTabStripScrollDelta({ deltaX, deltaY }) !== 0;
}
