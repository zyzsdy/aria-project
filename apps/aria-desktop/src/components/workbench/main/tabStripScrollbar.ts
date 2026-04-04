type TabStripScrollbarInput = {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
};

export function getTabStripThumbMetrics({
  clientWidth,
  scrollLeft,
  scrollWidth
}: TabStripScrollbarInput) {
  if (scrollWidth <= clientWidth || clientWidth <= 0) {
    return {
      offset: 0,
      size: 0,
      visible: false
    };
  }

  const size = (clientWidth * clientWidth) / scrollWidth;
  const maxOffset = clientWidth - size;
  const maxScrollLeft = scrollWidth - clientWidth;

  return {
    offset: maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * maxOffset : 0,
    size,
    visible: true
  };
}
