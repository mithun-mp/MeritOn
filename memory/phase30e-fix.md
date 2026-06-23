---
name: phase30e-fix
description: Applied safety checks to bulkUpdateQuestions and addQuestions to prevent accidental question count reduction; verified no destructive replacement in question manager flows.
metadata:
  type: project
---

**Problem (Phase 30E Emergency Fix)**: Prevent question manager from replacing the entire TestPaper.questions array when updating/adding questions, which causes data loss.

**Analysis**:
- Examined `backend-node/src/controllers/questionController.js` functions `bulkUpdateQuestions` and `addQuestions`.
- Found no wholesale replacement of `testPaper.questions`; both functions mutate elements in‑place.
- `saveAllManagerChanges` in `js/admin.js` correctly splits changes into `modifiedExisting` and `newQuestions`, sending them to the respective endpoints.
- Identified a separate destructive replacement in `testController.js:importCsvQuestions` (line 605) where `existingTestPaper.questions = finalQuestions;` – this belongs to the CSV import feature, not the question manager.
- No other controllers replace the questions array.

**Fixes Applied**:

1. **bulkUpdateQuestions**:
   - Added safety check: store original question count before updates.
   - After updates, verify that `testPaper.questions.length` has not decreased (since this endpoint only updates existing questions, never deletes).
   - If a decrease is detected, log error, record in ErrorLog, and return failure.
   - Added console logs for original/new counts.

2. **addQuestions**:
   - Added safety check: store original question count before inserting new questions.
   - After insertion, verify that the increase equals the number of new questions supplied.
   - If mismatch, log error, record in ErrorLog, and return failure.
   - Added console logs for original/new counts.

3. **Verified Syntax**:
   - Ran `node --check` on `questionController.js`, `api.js`, and `admin.js`; all passed.

**Result**:
- Question manager update flows now guard against accidental loss of existing questions.
- The fix ensures that any unexpected reduction in question count triggers an error response, preventing silent data loss.
- CSV import behavior remains unchanged (still replaces the whole array) but is outside the scope of the question manager emergency.

**Related Files**:
- `backend-node/src/controllers/questionController.js` – added safety checks.
- `backend-node/src/controllers/testController.js` – noted existing replacement in `importCsvQuestions` (no change made as out of scope).
- `js/admin.js` – confirmed proper splitting of updates.

**Testing Guidance**:
- Duplicate a test, modify an existing question via manager, verify other questions remain unchanged.
- Add new questions, verify existing count increases accordingly.
- Attempt to trigger a fault (e.g., mock a condition causing splice) and ensure error is returned.

Related memories: [[phase30b-implementation]], [[phase29b-analysis]], [[phase29a-fix-summary]]