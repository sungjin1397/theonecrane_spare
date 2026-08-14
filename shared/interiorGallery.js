function normalizeInteriorGalleryItems(items) {
  if (!Array.isArray(items)) return [];

  const valid = items
    .filter((item) => item && typeof item === 'object' && typeof item.image === 'string' && item.image.trim())
    .map((item) => ({
      id: item.id || `gallery-${Date.now()}-${Math.random()}`,
      image: item.image.trim(),
      title: typeof item.title === 'string' ? item.title.trim() || '시공 사진' : '시공 사진',
      description: typeof item.description === 'string' ? item.description.trim() || '시공 사진입니다.' : '시공 사진입니다.'
    }))
    .slice(0, 5);

  return valid;
}

module.exports = {
  normalizeInteriorGalleryItems
};
