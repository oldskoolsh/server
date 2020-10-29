import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";

export class CloudInitRecipeReferenceExpander {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: string[];
    private explanations: string[];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.explanations = [];
    }

    async expand(): Promise<string[]> {
        // get a full flat list of available recipes in the repo; those closest to root override those farthest away
        let availableRecipesMap: Map<string, Recipe> = await this.repoResolver.getFullFlatRecipeList();
        let availableRecipesArr: Recipe[] = [...availableRecipesMap.values()];


        console.log("availableRecipes", availableRecipesMap);

        // pick the initially specified ones from the list and use that as starting point.
        //  (what if we can't find one?) throw!
        let pickedRecipes: Recipe[] = [];
        for (const initialRecipe of this.initialRecipes) {
            pickedRecipes.push(<Recipe>availableRecipesMap.get(initialRecipe));
        }


        // iterate the available and evaluate expand_if and always_expand
        //   (against the initially specified list?)
        let auto_included: string[] = availableRecipesArr
            .filter(recipe => this.shouldAutoIncludeRecipe(recipe))
            .map(value => value.id);
        console.log("auto_included", auto_included);

        this.initialRecipes.unshift(...auto_included);
        console.log("After auto includes, ", this.initialRecipes);


        throw new Error("Method not implemented.");
    }

    private shouldAutoIncludeRecipe(recipe: Recipe): boolean {
        if (recipe.def.always_include) {
            return true;
        }
        if (recipe.id === "base") {
            console.log("the base");
        }
        if (recipe.def.include_if_recipe) {
            if (recipe.def.include_if_recipe.some(if_yes => {
                return this.initialRecipes.some(initial_recipe => initial_recipe === if_yes)
            })) return true;
        }
        if (recipe.def.include_if_not_recipe) {
            if (recipe.def.include_if_not_recipe.every(if_not => {
                return !this.initialRecipes.some(initial_recipe => initial_recipe === if_not)
            })) return true;
        }
        return false;
    }
}
