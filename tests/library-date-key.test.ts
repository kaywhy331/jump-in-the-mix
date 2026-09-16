import { expect, it } from 'vitest';
import { libraryDateKey, validateLibraryContent, EMPTY_LIBRARY_CONTENT } from '../src/lib/library-content';
it('preserves stable saved-date keys across repeated saves and previews', () => {
  expect(libraryDateKey('Café Follow Up')).toBe('cafe-follow-up');
  const content = { ...EMPTY_LIBRARY_CONTENT, title: 'Follow up', description: 'A useful check-in after a completed job.', triggerMode: 'DATE_TRIGGERED', dateTypeName: 'Job Complete', dateTypeSlug: null, steps: [{ ...EMPTY_LIBRARY_CONTENT.steps[0], body: 'Hello {{First Name}}' }] };
  const saved = validateLibraryContent(content);
  expect(saved.dateTypeSlug).toBe('job-complete');
  expect(validateLibraryContent(saved).dateTypeSlug).toBe(saved.dateTypeSlug);
});
