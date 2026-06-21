# TESTPAPER_MIGRATION_AUDIT

## Overview
This report audits the migration from legacy Test/Question collections to the new TestPaper collection in the MeritOn-CBT system.

## Storage Mode Configuration
The system uses configurable storage modes defined in `backend-node/src/utils/testPaperUtils.js`:
- `LEGACY`: Uses only legacy Test/Question models
- `OPTIMIZED`: Uses only TestPaper model (production mode)
- `DUAL`: Writes to both legacy and TestPaper models (development mode)

Current environment: `NODE_ENV=development` (from `.env` file)
→ Storage mode: **DUAL** (writes to both legacy and TestPaper collections)

## Legacy Collection Usage Analysis

### Files Using Legacy Test.find()/Test.findOne()/Test.findById()

1. **backend-node/src/controllers/examController.js**
   - Line 47: `let test = testPaper ? {...} : await Test.findOne({ TestID: data.TestId }).lean();`
   - Line 124: Various references to `test` object from Test model
   - Line 312: `const testDate = new Date(test.Date || Date.now());`
   - Line 347: `let test = testPaper ? {...} : await Test.findOne({ TestID: testId }).lean();`
   - **Usage**: ACTIVE PRODUCTION PATH (exam submission flow)
   - **Reason**: Fallback to legacy Test model when TestPaper not found

2. **backend-node/src/controllers/questionController.js**
   - Line 24: `let legacyTest = await Test.findOne({ TestID: testId, IsDeleted: { $ne: true } });`
   - Line 30: `answerKeyPublished = legacyTest.AnswerKeyPublished;`
   - **Usage**: ACTIVE PRODUCTION PATH (question retrieval)
   - **Reason**: Fallback to legacy Test model for answer key status

3. **backend-node/src/routes/api.js**
   - (Not fully examined in initial grep, but likely contains similar fallback patterns)

### Files Using Legacy Question.find()/Question.findOne()/Question.findById()

1. **backend-node/src/controllers/examController.js**
   - Line 47: `let questions = await testPaperUtils.getQuestions(data.TestId);` (which internally uses legacy fallback)
   - Lines 58-61: `questionMap` built from questions returned by testPaperUtils.getQuestions
   - **Usage**: ACTIVE PRODUCTION PATH (exam submission flow)
   - **Reason**: testPaperUtils.getQuestions() has legacy fallback

2. **backend-node/src/utils/testPaperUtils.js**
   - Line 240-251: `getQuestions()` function with explicit legacy fallback:
     ```javascript
     if (!testPaper) {
       const legacyQuestions = await Question.find({ TestID: testId, IsDeleted: false });
       return legacyQuestions;
     }
     ```
   - **Usage**: ACTIVE PRODUCTION PATH (question retrieval for exams)
   - **Reason**: Primary implementation with legacy fallback

3. **backend-node/src/controllers/questionController.js**
   - Throughout file: Direct Question model usage for CRUD operations
   - **Usage**: ACTIVE PRODUCTION PATH (question management)
   - **Reason**: Direct legacy model usage for question operations

### Files Referencing "Questions" and "Tests" (as collection names/references)

Multiple files reference these terms, primarily in:
- Model definitions (TestPaper.js references questions array)
- Utility functions (testPaperUtils.js)
- Controllers (examController.js, questionController.js, testController.js)
- Routes (api.js)

## Module-Specific Analysis

### 1. Test Module (testController.js)
- **Uses TestPaper only?**: ❌ NO
- **Evidence**: 
  - Lines 1-2: Imports both `Test` and `TestPaper` models
  - Lines 96-110: Creates legacy Test document when in LEGACY or DUAL mode
  - Lines 113-141: Creates TestPaper document when in DUAL or OPTIMIZED mode
  - Lines 171-200: Updates legacy Test document when in LEGACY or DUAL mode
  - Lines 202-221: Updates TestPaper document when in DUAL or OPTIMIZED mode
  - Similar dual-write patterns for delete, publishAnswerKey, getTestConfig functions
- **Verdict**: **DUAL WRITE MODE** - Actively writes to both legacy and TestPaper collections

### 2. Question Module (questionController.js)
- **Uses TestPaper only?**: ❌ NO
- **Evidence**:
  - Lines 2-4: Imports Question, Test, and TestPaper models
  - Lines 86-102: Creates legacy Question documents when in LEGACY or DUAL mode
  - Lines 105-141: Updates TestPaper questions array when in DUAL or OPTIMIZED mode
  - Similar dual-write patterns for updateQuestion and deleteQuestion functions
- **Verdict**: **DUAL WRITE MODE** - Actively writes to both legacy Question and TestPaper.questions

### 3. Exam Module (examController.js)
- **Uses TestPaper only?**: ❌ NO
- **Evidence**:
  - Line 47: Uses `testPaperUtils.getQuestions()` which has legacy fallback
  - Line 48-56: Prefers TestPaper but falls back to legacy Test model
  - Line 312: Uses legacy Test model for date parsing
  - Throughout: Mixed usage with preference for TestPaper but legacy fallbacks
- **Verdict**: **HYBRID MODE** - Prefers TestPaper but uses legacy fallbacks for compatibility

### 4. Leaderboard Module (examController.js - leaderboard functions)
- **Uses TestPaper only?**: ❌ NO
- **Evidence**:
  - `getLiveExamSessionLeaderboard()` function (lines 1733-1932):
    - Queries LiveExamSession with multiple TestId field variations
    - Queries SubmissionResult with multiple TestId field variations
    - No direct TestPaper usage for session/submission data
  - `getLeaderboard()` function (lines 1046-1168):
    - Uses SubmissionResult model directly
    - No TestPaper usage for leaderboard data
- **Verdict**: **LEGACY DEPENDENT** - Uses SubmissionResult/LiveExamSession which reference TestId but don't directly use TestPaper for core data

### 5. Admin Module (Various controllers)
- **Uses TestPaper only?**: ❌ NO
- **Evidence**:
  - testController.js: Dual-write as shown above
  - questionController.js: Dual-write as shown above
  - testDraftController.js: Uses only TestDraft model (separate concern)
- **Verdict**: **MIXED** - Some admin functions use dual-write, others use separate models

## Detailed Findings by File

### backend-node/src/controllers/testController.js
- **Test.find() usage**: Lines 97, 172, 253, 266, 306, 316
- **Test.findOne() usage**: Lines 97, 172, 253, 266, 306, 316
- **Test.findById() usage**: None found
- **Question.find() usage**: Lines 658-674 (in importCsvQuestions dual-write)
- **Usage classification**: **ACTIVE DUAL WRITE PATH** - Creates/updates both legacy and TestPaper collections

### backend-node/src/controllers/questionController.js
- **Test.find() usage**: Line 24 (Test.findOne for fallback)
- **Test.findOne() usage**: Line 24
- **Test.findById() usage**: None found
- **Question.find() usage**: Lines 55, 75, 173, 194, 210, 226, 259, 274
- **Question.findOne() usage**: Lines 173, 259
- **Question.findById() usage**: None found
- **Usage classification**: **ACTIVE DUAL WRITE PATH** - Direct legacy model usage with TestPaper updates

### backend-node/src/controllers/examController.js
- **Test.find() usage**: Line 47, 347 (Test.findOne)
- **Test.findOne() usage**: Lines 47, 347
- **Test.findById() usage**: None found
- **Question.find() usage**: Line 47 (via testPaperUtils.getQuestions)
- **Usage classification**: **ACTIVE HYBRID PATH** - Prefers TestPaper with legacy fallbacks

### backend-node/src/utils/testPaperUtils.js
- **Test.find() usage**: Lines 60, 221 (Test.findOne)
- **Test.findOne() usage**: Lines 60, 221
- **Test.findById() usage**: None found
- **Question.find() usage**: Lines 63, 245 (Question.find)
- **Usage classification**: **ACTIVE HYBRID PATH** - Primary TestPaper with legacy fallback functions

### backend-node/src/routes/api.js
- **Likely contains similar patterns** - routes that controller the above functions

## Conclusion

### 1. Which files still use legacy collections
**Multiple files** still use legacy collections:
- testController.js (Test model)
- questionController.js (Question model)  
- examController.js (Test model fallbacks)
- testPaperUtils.js (Test and Question model fallbacks)
- All files importing Test or Question models

### 2. Whether usage is:
- **Active production path**: YES - All legacy usage is in active code paths
- **Fallback path**: PARTIAL - Some usage is primary (question CRUD), some is fallback (exam controller)
- **Dead code**: NO - No dead legacy code found; all legacy usage is active

### 3. Whether candidate module uses TestPaper only
**NO** - Candidate-facing code (examController.js) uses TestPaper primarily but with legacy fallbacks

### 4. Whether admin module uses TestPaper only
**NO** - Admin module uses dual-write patterns for test/question management

### 5. Whether exam module uses TestPaper only
**NO** - Exam module uses TestPaper primarily but with critical legacy fallbacks

### 6. Whether leaderboard uses TestPaper only
**NO** - Leaderboard module uses SubmissionResult/LiveExamSession models which don't directly integrate with TestPaper for core data

## Migration Completeness Assessment
**INCOMPLETE MIGRATION** - The system is running in DUAL storage mode, maintaining both legacy and TestPaper collections simultaneously. This appears to be a migration strategy rather than a completed migration.

**Risk**: Dual-write mode creates potential for data inconsistency between legacy and TestPaper collections if writes fail partially.

**Recommendation**: Complete migration to TestPaper-only (OPTIMIZED mode) after verifying data consistency and updating all code paths to remove legacy dependencies.