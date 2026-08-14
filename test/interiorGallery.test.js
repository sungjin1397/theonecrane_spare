const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInteriorGalleryItems } = require('../shared/interiorGallery');

test('normalizeInteriorGalleryItems keeps only valid images and caps at five items', () => {
  const items = [
    { id: '1', image: 'data:image/jpeg;base64,aaa', title: 'A', description: 'First' },
    { id: '2', image: 'data:image/jpeg;base64,bbb', title: 'B', description: 'Second' },
    { id: '3', image: 'data:image/jpeg;base64,ccc', title: 'C', description: 'Third' },
    { id: '4', image: 'data:image/jpeg;base64,ddd', title: 'D', description: 'Fourth' },
    { id: '5', image: 'data:image/jpeg;base64,eee', title: 'E', description: 'Fifth' },
    { id: '6', image: 'data:image/jpeg;base64,fff', title: 'F', description: 'Sixth' },
    { id: '7', image: '', title: 'Invalid', description: 'no image' },
    { id: '8', image: 'https://example.com/test.jpg', title: 'G', description: 'valid remote image' }
  ];

  const normalized = normalizeInteriorGalleryItems(items);

  assert.equal(normalized.length, 5);
  assert.equal(normalized[0].title, 'A');
  assert.equal(normalized[4].title, 'E');
  assert.ok(normalized.every(item => Boolean(item.image)));
  assert.ok(!normalized.some(item => item.title === 'Invalid'));
});
