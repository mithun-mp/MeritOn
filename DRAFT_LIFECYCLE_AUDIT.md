# DRAFT_LIFECYCLE_AUDIT

## Overview
This report audits the test draft lifecycle functionality in the MeritOn-CBT system, covering save, resume, listing, commit, and delete operations.

## TestDraft Schema Analysis
**File**: `backend-node/src/models/TestDraft.js`

### Fields Present:
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| DraftID | String | -- | Unique identifier (required) |
| AdminUserID | String | '' | Admin who created draft |
| DraftName | String | -- | Draft name (required) |
| TestDataJSON | Mixed | -- | Test configuration data |
| QuestionsJSON | Mixed | -- | Questions array data |
| Status | String | 'DRAFT' | Draft status ('DRAFT' or 'COMMITTED') |
| CreatedAt | Date | Date.now | Creation timestamp |
| UpdatedAt | Date | Date.now | Last update timestamp |
| LastSavedAt | Date | Date.now | Last auto-save timestamp |
| CommittedTestID | String | null | ID of test created from draft |
| IsDeleted | Boolean | false | Soft delete flag |
| DeletedAt | Date | null | Soft delete timestamp |
| **CompletedAt** | **Not in Schema** | -- | **Referenced only in commit function** |

> **Note**: `CompletedAt` is referenced in `commitDraftToTest` function but **not defined in the schema**. This field will be stored in MongoDB but is not part of the official schema definition.

## Function-by-Function Audit

### 1. Draft Save: `saveTestDraft` (Lines 17-66)
**File**: `backend-node/src/controllers/testDraftController.js`

**Operation**:
- Creates new draft or updates existing one by DraftID
- Sets required fields:
  - DraftID (generated if not provided)
  - DraftName (from input)
  - TestDataJSON (test configuration)
  - QuestionsJSON (questions array)
  - Status: 'DRAFT' (explicitly set)
  - IsDeleted: false (explicitly set)
  - UpdatedAt: new Date()
  - LastSavedAt: new Date()
- **Does NOT set**: CommittedTestID, CompletedAt, DeletedAt (remain null/default)
- **Validation**: Admin session required
- **Persistence**: Uses `TestDraft.create()` (new) or `TestDraft.updateOne()` (existing)

**Verified Behavior**: ✅ Correctly saves draft with proper initial state

### 2. Draft Resume: `getTestDraft` (Lines 68-94)
**File**: `backend-node/src/controllers/testDraftController.js`

**Operation**:
- Retrieves draft by DraftID
- **Critical Filter**: `IsDeleted: { $ne: true }` (excludes soft-deleted drafts)
- Returns draft object with:
  - TestData parsed from TestDataJSON
  - Questions parsed from QuestionsJSON
  - JSON fields removed from response
- **Does NOT check**: Status field (returns both DRAFT and COMMITTED drafts if not deleted)
- **Validation**: Admin session required

**Verified Behavior**: ✅ Correctly excludes soft-deleted drafts, but returns both DRAFT and COMMITTED drafts

### 3. Draft Listing: `getTestDrafts` (Lines 96-120)
**File**: `backend-node/src/controllers/testDraftController.js`

**Operation**:
- Lists all available drafts
- **Critical Filters**:
  - `IsDeleted: false` (excludes soft-deleted drafts)
  - `Status: 'DRAFT'` (explicitly excludes committed drafts)
- Sorts by: `UpdatedAt: -1` (newest first)
- Returns draft objects with:
  - TestData parsed from TestDataJSON
  - Questions parsed from QuestionsJSON
  - JSON fields removed from response
- **Validation**: Admin session required

**Verified Behavior**: ✅ **Correctly excludes committed drafts** from listing (Status: 'DRAFT' filter)

### 4. Draft Commit: `commitDraftToTest` (Lines 150-230)
**File**: `backend-node/src/controllers/testDraftController.js`

**Operation**:
- Retrieves draft by DraftID (no IsDeleted/status filter)
- Validates admin session
- Creates new Test document:
  - TestID: Generate new 'T' + UUID
  - Maps draft.TestDataJSON to Test fields
  - Sets IsDeleted: false
- Creates Question documents for each question in draft:
  - Maps draft.QuestionsJSON to Question fields
  - Sets IsDeleted: false
- **Marks original draft as committed**:
  - Status: "COMMITTED"
  - IsDeleted: true
  - DeletedAt: new Date()
  - CommittedTestID: newly created testId
  - CompletedAt: new Date()  → **FIELD NOT IN SCHEMA**
- Uses `TestDraft.updateOne()` with $set operation
- **Validation**: Admin session required
- **Persistence**: Creates Test/Question records, updates draft state

**Verified Behavior**: 
- ✅ Creates new test and questions from draft data
- ✅ Marks draft as committed (Status: "COMMITTED")
- ✅ Soft deletes draft (IsDeleted: true)
- ✅ Links draft to new test via CommittedTestID
- ⚠️ **Sets CompletedAt field not defined in schema** (harmless but indicates incomplete implementation)

### 5. Draft Delete: `deleteTestDraft` (Lines 122-148)
**File**: `backend-node/src/controllers/testDraftController.js`

**Operation**:
- Soft deletes draft by DraftID
- Sets:
  - IsDeleted: true
  - DeletedAt: new Date()
- Uses `TestDraft.updateOne()` with $set operation
- **Does NOT affect**: Status field (draft retains its Status when soft deleted)
- **Validation**: Admin session required

**Verified Behavior**: ✅ Correctly implements soft delete (preserves draft state for potential recovery)

## Draft Lifecycle Verification

### Draft States:
1. **Active Draft**: IsDeleted: false, Status: 'DRAFT'
2. **Soft-Deleted Draft**: IsDeleted: true, Status: preserves original value ('DRAFT' or 'COMMITTED')
3. **Committed Draft**: IsDeleted: true, Status: 'COMMITTED'

### State Transitions:
```
[New Draft] 
    → saveTestDraft → [Active Draft] (IsDeleted:false, Status:'DRAFT')
        → resumeDraft/getTestDraft → [Active Draft] (loaded for editing)
        → saveTestDraft → [Active Draft] (updated)
        → commitDraftToTest → [Committed Draft] (IsDeleted:true, Status:'COMMITTED', CommittedTestID:set)
        → deleteTestDraft → [Soft-Deleted Committed Draft] (IsDeleted:true, Status:'COMMITTED')
        → commitDraftToTest → [Already committed - would fail on draft lookup or create duplicate test]
```

### Critical Verification: Committed Draft Exclusion from Listing
**Requirement**: "After successful final test creation: draft must NEVER appear again."

**Verification**:
- `getTestDrafts` uses query: `{ IsDeleted: false, Status: 'DRAFT' }`
- Committed drafts have: `IsDeleted: true, Status: 'COMMITTED'`
- **Result**: Committed drafts fail BOTH conditions:
  - IsDeleted: false → **FALSE** (IsDeleted is true)
  - Status: 'DRAFT' → **FALSE** (Status is 'COMMITTED')
- **Conclusion**: ✅ **Committed drafts are correctly EXCLUDED from draft listing**

### Additional Verification Points:
1. **Draft Resume Safety**: 
   - `getTestDraft` only filters by `IsDeleted: { $ne: true }`
   - Would return committed drafts if called directly by DraftID
   - **Mitigation**: Frontend should only call resume for drafts obtained from `getTestDrafts` listing
   - **Risk Level**: LOW (requires direct DraftID knowledge of committed draft)

2. **Schema Inconsistency**:
   - `CompletedAt` field set in `commitDraftToTest` but not in schema
   - **Impact**: Harmless (MongoDB stores it anyway), but indicates incomplete refactoring
   - **Recommendation**: Either add to schema or remove references

3. **Double Commit Protection**:
   - Function retrieves draft by DraftID without Status filter
   - If called on already-committed draft:
     - Would create a NEW test (duplicate)
     - Would overwrite CommittedTestID with new test ID
     - Would reset CompletedAt to new timestamp
   - **Current Protection**: None in function logic
   - **Required Protection**: Should check `Status !== 'COMMITTED'` or `IsDeleted !== false` before processing

## Conclusion

### ✅ Verified Working:
1. **Draft Save**: Correctly creates/updates drafts with proper initial state
2. **Draft Listing**: ✅ **Correctly excludes committed drafts** (IsDeleted:false + Status:'DRAFT' filter)
3. **Draft Commit**: Correctly creates test/questions and marks draft as committed/deleted
4. **Draft Delete**: Correctly implements soft delete preserving state

### ⚠️ Minor Issues:
1. **CompletedAt Field**: Referenced in function but not in schema (harmless inconsistency)
2. **Draft Resume Safety**: `getTestDraft` returns committed drafts if queried by ID directly
3. **Double Commit Risk**: No protection against committing already-committed draft

### 🔴 Potential Issue (Not Currently Exploited):
**Double Test Creation Risk**: If `commitDraftToTest` is called on an already-committed draft:
1. Finds draft by DraftID (ignoring Status/IsDeleted)
2. Creates NEW test with new TestID
3. Creates NEW questions
4. Updates draft with new CommittedTestID (overwrites old)
5. Result: Original test orphaned, new test created, draft shows committed to new test

**However**: This requires deliberate misuse (calling commit with known committed DraftID) or frontend bug. The draft listing correctly hides committed drafts, preventing accidental reselection.

### Final Verification:
**Requirement Met**: ✅ After successful test creation, committed drafts **do NOT appear** in draft listing (`getTestDrafts`) due to explicit `Status: 'DRAFT'` filter.

**Draft Lifecycle Status**: **FUNCTIONALLY COMPLIANT** with minor code quality issues that do not affect core requirement.