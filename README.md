Run these pip commands

```
cd sih-code
python -m venv .venv
.venv\Scripts\activate
pip install langchain==0.2.12 langchain-core==0.2.35 langchain-community==0.2.10
pip install -r requirements.txt
python run_demo.py
```
if there's a permission error when you try to activate venv saying can't run scripts on pc then do:
```
Get-ExecutionPolicy
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```
then try running ```.venv\Scripts\activate``` again
