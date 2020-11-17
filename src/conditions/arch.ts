export interface IArch {
    id: string;
    other_names: string[];
    is_default: boolean
}

export class BaseArch {
    static createArch(arch: string): IArch {
        let allArches: IArch[] = [new archAmd64(), new archI386(), new archArm64()];
        let idMatch = allArches.filter(value => value.id === arch);
        if (idMatch.length != 1) {
            idMatch = allArches.filter(value => value.other_names.includes(arch));
            if (idMatch.length != 1) {
                throw new Error(`Unknown Arch: ${arch}`)
            }
        }
        return idMatch[0];
    }
}

export class archAmd64 extends BaseArch implements IArch {
    id: string = "amd64";
    other_names = ["x86_64"]
    is_default = true;
}

export class archI386 extends BaseArch implements IArch {
    id: string = "i386";
    other_names = ["x86", "x86_32"]
    is_default = true;
}

export class archArm64 extends BaseArch implements IArch {
    id: string = "arm64";
    other_names = ["aarch64", "armv8"]
    is_default = false;
}
