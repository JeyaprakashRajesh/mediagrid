@echo off
echo ==========================================
echo Running MediaGrid Phase 1 CI Verification
echo ==========================================

echo.
echo [1/2] Running Rust Backend Unit Tests...
cd apps\server\src-tauri
call cargo test
if %errorlevel% neq 0 (
    echo.
    echo Rust unit tests failed!
    exit /b %errorlevel%
)

echo.
echo [2/2] Running Frontend Workspace Unit Tests...
cd ..\..\..
call pnpm test
if %errorlevel% neq 0 (
    echo.
    echo Frontend unit tests failed!
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo All tests passed successfully! Phase 1 verified.
echo ==========================================
