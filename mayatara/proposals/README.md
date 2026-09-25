# Proposals

Scripts that generate the **Arka** solar-kit manufacturing proposal documents.
They are standalone: they don't use the Mayatara app and have their own dependencies.

| Script | Output (written to `~/Desktop`) |
|---|---|
| `generate_land_proposal.js` | `Arka_Land_Request_Proposal.docx` |
| `generate_state_docx.js` | `Arka_Telangana_Site_Proposal.docx`, `Arka_AndhraPradesh_Site_Proposal.docx` |
| `generate_state_pdfs.py` | `Arka_Telangana_Site_Proposal.pdf`, `Arka_AndhraPradesh_Site_Proposal.pdf` |

```bash
npm install                        # docx
npm run land                       # land request proposal
npm run states                     # state site proposals (.docx)

pip install -r requirements.txt    # reportlab
npm run pdfs                       # state site proposals (.pdf)
```
