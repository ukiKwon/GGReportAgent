Rem Weekly collector hidden launcher (11-23): the console window of run_weekly.cmd was closed at 09:19 -> exit 0xC000013A.
Rem Runs run_weekly.cmd with no window (0) and waits (True), returning its exit code to Task Scheduler.
Dim sh, dir
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit sh.Run("cmd.exe /c """ & dir & "\run_weekly.cmd""", 0, True)
