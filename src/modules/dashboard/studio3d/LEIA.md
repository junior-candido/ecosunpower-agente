# Studio 3D — build do app (NÃO editar à mão)

Estes arquivos são o BUILD do app 3D do repositório `simulador-fv` (pasta `app/`).
Servidos por `studio3d-rotas.ts` em `/dashboard/studio-3d` (módulo `studio_3d`).

Para atualizar (no PC, Git Bash):

    cd simulador-fv/app
    MSYS_NO_PATHCONV=1 STUDIO_BASE=/dashboard/studio-3d/ npx vite build
    rm -f <este repo>/src/modules/dashboard/studio3d/assets/*
    cp dist/index.html <este repo>/src/modules/dashboard/studio3d/
    cp dist/assets/* <este repo>/src/modules/dashboard/studio3d/assets/

O motor (simulador-fv/motor) roda no EasyPanel (serviço `motor`, MOTOR_URL/MOTOR_TOKEN
no agente). O leitor de datasheet precisa de ANTHROPIC_API_KEY no serviço do motor.
