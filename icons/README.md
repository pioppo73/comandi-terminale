# Icone dei sistemi operativi

Sostituisci questi tre file per cambiare i loghi mostrati nell'app. Il nome del file deve restare identico: `apple.svg` (Mac), `windows.svg`, `linux.svg`.

Consigli:

- Usa `viewBox="0 0 24 24"` per mantenere le proporzioni coerenti con il resto dell'interfaccia (se usi un altro viewBox va comunque bene, l'icona verrà semplicemente scalata di conseguenza).
- Se non imposti un colore (`fill`) sui singoli elementi del disegno, l'icona verrà mostrata automaticamente in **bianco**, come le attuali.
- Se invece vuoi un logo colorato, imposta il `fill` direttamente sui singoli `<path>`/`<rect>`/ecc. del tuo SVG: verrà rispettato.
- Dopo aver caricato il nuovo file su GitHub, ricarica la pagina dell'app: il cambiamento è immediato, non serve nessuna modifica al codice.
