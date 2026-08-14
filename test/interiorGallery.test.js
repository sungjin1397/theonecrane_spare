const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInteriorGalleryItems, resolveInteriorGalleryItems } = require('../shared/interiorGallery');

test('resolveInteriorGalleryItems prefers server data over local fallback and caps the final list', () => {
  const serverItems = [
    { id: 'srv-1', image: 'data:image/jpeg;base64,aaa', title: 'Server A', description: 'Server detail' },
    { id: 'srv-2', image: 'data:image/jpeg;base64,bbb', title: 'Server B', description: 'Server detail 2' },
    { id: 'srv-3', image: 'data:image/jpeg;base64,ccc', title: 'Server C', description: 'Server detail 3' }
  ];
  const localItems = [
    { id: 'local-1', image: 'data:image/jpeg;base64,zzz', title: 'Local Z', description: 'Local detail' },
    { id: 'local-2', image: 'data:image/jpeg;base64,yyy', title: 'Local Y', description: 'Local detail 2' }
  ];

  const resolved = resolveInteriorGalleryItems(serverItems, localItems);

  assert.equal(resolved.length, 3);
  assert.equal(resolved[0].title, 'Server A');
  assert.ok(!resolved.some(item => item.title.startsWith('Local')));
});

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
