import { AppExtendedModel } from "@/shared/model/app-extended.model";

export class EnvVarUtils {
    static parseEnvVariables(app: AppExtendedModel) {
        return app.envVars ? app.envVars.split('\n').filter(x => !!x).map(env => {
            let [name] = env.split('=');
            name = name.trim();
            let value = env.replace(`${name}=`, '').trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            return { name, value };
        }) : [];
    }
}