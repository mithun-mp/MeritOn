# PHASE 29B – ANALYSIS ONLY: DRAFT FINALIZATION + CSV EXISTING UPDATE DUPLICATION

## 1. DRAFT_ROOT_CAUSE
The draft persists in Resume Draft window after successful test creation because the `commitDraftToTest` call occurs **after** the success message, wizard reset, and dashboard refresh in `saveAllWizard()`. If `commitDraftToTest` fails, the user sees a success message but the draft remains in `DRAFT`/`IsDeleted:false` state, causing it to reappear in the Resume Draft modal.

## 2. DRAFT_MISMATCH_DETAILS
- **Is currentDraftID set when resuming a draft?** YES (line 1373 in `resumeDraft()`: `currentDraftID = draft.DraftID;`)
- **Is currentDraftID still available after createTest + addQuestions?** YES (checked at line 2111 in `saveAllWizard()`)
- **Is commitDraftToTest actually called?** YES (lines 2113-2126 in `saveAllWizard()`), but **after** wizard reset
- **Does routes/api.js have a case for commitDraftToTest?** YES (lines 188-191)
- **Does the route pass DraftID and testId correctly?** 
  - DraftID: YES (passed as `data.DraftID`)
  - testId: NO (frontend sends `testId` in payload but route does NOT pass it to controller; controller ignores it and generates its own)
- **Does testDraftController.commitDraftToTest expect the same parameter names?**
  - Function signature: `commitDraftToTest(DraftID, sessionToken)` 
  - Route call: `testDraftController.commitDraftToTest(data.DraftID, data.sessionToken)`
  - For DraftID/sessionToken: YES
  - For testId: NO (function does not accept testId parameter)
- **Does commitDraftToTest mark the draft correctly?**
  - Status: "COMMITTED" - YES (line 209)
  - IsDeleted: true - YES (line 210)
  - DeletedAt: YES (line 211)
  - CompletedAt: YES (line 213)
  - CommittedTestID: YES (line 212) - but uses newly generated testId instead of frontend-sent testId
- **Does getTestDrafts query exclude committed/deleted drafts?** YES (line 103: `{ IsDeleted: false, Status: 'DRAFT' }`)
- **Is there any frontend cached draft list?** NO - `openWizard()` calls `getTestDrafts()` fresh each time (lines 1263-1268)
- **Is showResumeModal called with empty/invalid response?** NO - lines 1263-1268 check `if (drafts && drafts.length > 0)`

**Root Cause**: The `commitDraftToTest` logic runs after the success handler in `saveAllWizard()`, so if it fails, the user has already seen success and moved on, but the draft remains active.

## 3. CSV_DUPLICATE_ROOT_CAUSE
When selecting an existing test in CSV upload mode, the system appears to create a duplicate/test because the `update_existing` branch in `importCsvQuestions()` fetches the TestPaper twice, overwriting any test metadata (name, date, etc.) updates made in the first fetch with the second fetch.

## 4. CSV_MISMATCH_DETAILS
- **What is the actual id/name of the CSV action selector?** `csvAction` (line 2369 in `handleCSVUpload()`)
- **What values does it produce?** 
  - `'new'` for new test → `importMode='create_new'` (line 2382)
  - `'existing'` (or non-'new') for existing test → `importMode='update_existing'` (line 2382)
- **What is the actual id of existing test dropdown?** `csvTestSelect` (line 2261 in `populateCSVSelect()`)
- **Is selectedExistingTestId correctly read?** YES (line 2370: `const testId = document.getElementById('csvTestSelect')?.value;`)
- **Is importMode derived from correct value?** YES (line 2382: `const importMode = action === 'new' ? 'create_new' : 'update_existing';`)
- **Is payload.mode exactly "update_existing" when existing test is selected?** YES (when action ≠ 'new', importMode='update_existing')
- **Is payload.testId populated?** YES (when importMode='update_existing', payload.testId = testId from line 2370)
- **Does api.js preserve payload.testId?** YES (js/api.js lines 80-108 send full requestData as JSON body)
- **Does routes/api.js pass full data object to importCsvQuestions?** YES (line 163: `result = await testController.importCsvQuestions(data, data.sessionToken);`)
- **Does importCsvQuestions normalize testId correctly?** 
  - For update_existing: `testId = data.testId || data.TestID` = selected test ID ✓
  - For create_new: `testId = undefined` (correct)
- **Does importcCsvQuestions ever enter create_new branch when mode is update_existing?** NO - lines 460-462: `if (importMode === 'create_new') { ... } else { ... }` (update_existing branch)
- **Is there any duplicate handleCSVUpload function?** NO EVIDENCE OF - only one definition found
- **Is there any old CSV upload handler still bound to button onclick?** NO EVIDENCE OF
- **Does admin-dashboard.html call the correct handleCSVUpload?** LIKELY YES - standard wiring pattern observed

**Root Cause**: In `importCsvQuestions()` update_existing branch (lines 466-525):
1. Line 470: `const existingTestPaper = await TestPaper.findOne({ TestID: testId });` (FETCH 1)
2. Lines 480-496: If testData provided, update `existingTestPaper.meta` fields
3. Line 590: `const testPaper = await TestPaper.findOne({ TestID: finalTestId });` (FETCH 2 - OVERWRITES FETCH 1)
4. Lines 591-593: Overwrite sections, questions, stats
5. Line 594: `await testPaper.save();`

This causes test metadata updates (name, date, etc.) from CSV to be LOST, making it appear as if the test wasn't updated.

## 5. FILES_REQUIRING_FIX
1. `backend-node/src/controllers/testController.js`
2. `js/admin.js`

## 6. EXACT_FUNCTIONS_REQUIRING_FIX
1. `saveAllWizard()` in `js/admin.js` - move `commitDraftToTest` logic inside success block
2. `importCsvQuestions()` in `backend-node/src/controllers/testController.js` - fix double fetch in update_existing branch

## 7. MINIMAL_PATCH_PLAN_FOR_STEP_2
### File: js/admin.js
In `saveAllWizard()` function:
- Move lines 2110-2126 (the commitDraftToTest block) to be **inside** the success block that starts at line 2128, BEFORE the wizard hiding/reset code.

### File: backend-node/src/controllers/testController.js
In `importCsvQuestions()` function, update_existing branch (else block):
- Remove the redundant fetch at line 590 (`const testPaper = await TestPaper.findOne({ TestID: finalTestId });`)
- Use the already-fetched `existingTestPaper` variable from line 470 for the update operations
- Replace lines 590-594 with:
  ```javascript
  existingTestPaper.sections = sections;
  existingTestPaper.questions = finalQuestions;
  existingTestPaper.stats = stats;
  await existingTestPaper.save();
  ```
- Keep the dual write logic unchanged (it already uses `finalTestId` correctly)

## 8. RISK_LEVEL: HIGH
- Draft issue: Causes orphaned tests and user confusion about draft state
- CSV issue: Causes loss of test metadata updates during CSV existing update, leading to data inconsistency
- Both issues violate core functionality expectations and require user workaround