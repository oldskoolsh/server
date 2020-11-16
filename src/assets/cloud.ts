export interface ICloud {
    id: string;
    other_names: string[];
}

export class BaseCloud {
    static createCloud(cloud: string): ICloud {
        let allArches: ICloud[] = [new UnknownCloud(), new NonCloudCloud()];
        let idMatch = allArches.filter(value => value.id === cloud);
        if (idMatch.length != 1) {
            idMatch = allArches.filter(value => value.other_names.includes(cloud));
            if (idMatch.length != 1) {
                console.warn(`*** Unknown Cloud:`, cloud);
            }
        }
        return idMatch[0];
    }
}

export class UnknownCloud extends BaseCloud implements ICloud {
    id = "unknown";
    other_names = []
}

export class NonCloudCloud extends BaseCloud implements ICloud {
    id = "noncloud";
    other_names = ["libvirt", "nocloud"];
}
